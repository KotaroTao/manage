import prisma from "@/lib/prisma";
import { addDays } from "@/lib/utils";
import type { PrismaClient, Workflow, WorkflowStep } from "@prisma/client";

/**
 * Prisma interactive transaction client type.
 * Equivalent to the `tx` argument inside prisma.$transaction(async (tx) => {...}).
 */
type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

// ============================================================
// Workflow Engine
// ============================================================

/**
 * Start a new workflow from a template.
 *
 * 1. Fetches the template and its step templates (ordered by sortOrder).
 * 2. Creates a Workflow record linked to the customerBusiness.
 * 3. Creates WorkflowStep records for each step template:
 *    - The first step is set to ACTIVE; the rest remain PENDING.
 *    - Due dates are calculated based on daysFromStart / daysFromPrevious.
 *
 * @throws Error if the template is not found or has no steps.
 */
export async function startWorkflow(
  templateId: string,
  customerBusinessId: string,
  startDate: Date,
  assigneeId: string,
): Promise<Workflow> {
  // Load the template with its steps
  const template = await prisma.workflowTemplate.findUnique({
    where: { id: templateId },
    include: {
      steps: {
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!template) {
    throw new Error(`ワークフローテンプレートが見つかりません: ${templateId}`);
  }

  if (template.steps.length === 0) {
    throw new Error(
      `テンプレートにステップが定義されていません: ${template.name}`,
    );
  }

  // Build the step data with calculated due dates.
  // Pre-compute all due dates in a single forward pass (O(N)) to avoid
  // the O(N^2) cost of recursively walking the chain for each step.
  const stepTemplates = template.steps;
  const dueDates: Date[] = [];
  for (let i = 0; i < stepTemplates.length; i++) {
    const st = stepTemplates[i];
    if (st.daysFromStart != null) {
      // Absolute: days from the workflow start date
      dueDates[i] = addDays(startDate, st.daysFromStart);
    } else if (st.daysFromPrevious != null && i > 0) {
      // Relative: days from the previous step's due date
      dueDates[i] = addDays(dueDates[i - 1], st.daysFromPrevious);
    } else {
      // Default: same as start date
      dueDates[i] = new Date(startDate);
    }
  }

  const stepsData = stepTemplates.map(
    (
      stepTemplate: {
        id: string;
        title: string;
        description: string | null;
        sortOrder: number;
        daysFromStart: number | null;
        daysFromPrevious: number | null;
      },
      index: number,
    ) => ({
      stepTemplateId: stepTemplate.id,
      title: stepTemplate.title,
      description: stepTemplate.description,
      sortOrder: stepTemplate.sortOrder,
      assigneeId,
      dueDate: dueDates[index],
      status: index === 0 ? ("ACTIVE" as const) : ("PENDING" as const),
    }),
  );

  // Create the workflow and all steps in a transaction
  const workflow = await prisma.$transaction(async (tx: TxClient) => {
    const wf = await tx.workflow.create({
      data: {
        templateId,
        customerBusinessId,
        status: "ACTIVE",
        startedAt: startDate,
        steps: {
          create: stepsData,
        },
      },
      include: {
        steps: {
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    return wf;
  });

  return workflow;
}

/**
 * Mark a workflow step as completed.
 *
 * 1. Validates the step exists and is in ACTIVE status.
 * 2. Updates the step to DONE with a completedAt timestamp.
 * 3. Automatically activates the next pending step.
 * 4. If all steps are done, marks the entire workflow as COMPLETED.
 *
 * @throws Error if the step is not found or not in an activatable state.
 */
export async function completeStep(
  stepId: string,
  // NOTE: userId is accepted for API compatibility and could be used
  // for audit / version logging at the API layer.
  userId: string,
): Promise<WorkflowStep> {
  const now = new Date();

  // Complete the step and activate the next one in a transaction.
  // All validation is performed inside the transaction to prevent
  // TOCTOU race conditions.
  const completedStep = await prisma.$transaction(async (tx: TxClient) => {
    const step = await tx.workflowStep.findUnique({
      where: { id: stepId },
      include: {
        workflow: true,
      },
    });

    if (!step) {
      throw new Error(`ワークフローステップが見つかりません: ${stepId}`);
    }

    if (step.status !== "ACTIVE") {
      throw new Error(
        `ステップがアクティブ状態ではないため完了できません (現在のステータス: ${step.status})`,
      );
    }

    if (step.workflow.status !== "ACTIVE") {
      throw new Error("ワークフローがアクティブ状態ではありません");
    }

    // Mark the current step as DONE
    const updated = await tx.workflowStep.update({
      where: { id: stepId },
      data: {
        status: "DONE",
        completedAt: now,
      },
    });

    // Activate the next pending step
    await activateNextStep(tx, step.workflowId, step.sortOrder, now);

    return updated;
  });

  return completedStep;
}

/**
 * Activate the next pending step in the workflow after a step is completed.
 *
 * Finds the next step by sortOrder that is still PENDING and sets it to ACTIVE.
 * If the next step has daysFromPrevious defined, the due date is recalculated
 * based on the completion date of the just-completed step.
 *
 * If there are no more pending steps, the workflow is marked as COMPLETED.
 *
 * @param tx - Prisma transaction client
 * @param workflowId - The workflow ID
 * @param completedSortOrder - The sortOrder of the step that was just completed
 * @param completionDate - When the previous step was completed (used for relative due dates)
 */
async function activateNextStep(
  tx: TxClient,
  workflowId: string,
  completedSortOrder: number,
  completionDate: Date,
): Promise<void> {
  // Find the next pending step
  const nextStep = await tx.workflowStep.findFirst({
    where: {
      workflowId,
      sortOrder: { gt: completedSortOrder },
      status: "PENDING",
    },
    orderBy: { sortOrder: "asc" },
    include: {
      stepTemplate: true,
    },
  });

  if (!nextStep) {
    // No more pending steps -- check if all steps are done
    const remainingActive = await tx.workflowStep.count({
      where: {
        workflowId,
        status: { in: ["PENDING", "ACTIVE", "WAITING"] },
      },
    });

    if (remainingActive === 0) {
      // All steps are complete: mark the workflow as COMPLETED
      await tx.workflow.update({
        where: { id: workflowId },
        data: {
          status: "COMPLETED",
          completedAt: completionDate,
        },
      });
    }
    return;
  }

  // Calculate the new due date if daysFromPrevious is defined on the template
  let newDueDate = nextStep.dueDate;
  if (nextStep.stepTemplate?.daysFromPrevious != null) {
    newDueDate = addDays(
      completionDate,
      nextStep.stepTemplate.daysFromPrevious,
    );
  }

  // Activate the next step
  await tx.workflowStep.update({
    where: { id: nextStep.id },
    data: {
      status: "ACTIVE",
      dueDate: newDueDate,
    },
  });
}

/**
 * Skip a workflow step. Sets the status to SKIPPED and activates the next step.
 *
 * @throws Error if the step is not found or already completed/skipped.
 */
export async function skipStep(stepId: string): Promise<WorkflowStep> {
  const now = new Date();

  // All validation is performed inside the transaction to prevent
  // TOCTOU race conditions.
  const skippedStep = await prisma.$transaction(async (tx: TxClient) => {
    const step = await tx.workflowStep.findUnique({
      where: { id: stepId },
      include: { workflow: true },
    });

    if (!step) {
      throw new Error(`ワークフローステップが見つかりません: ${stepId}`);
    }

    if (step.status === "DONE" || step.status === "SKIPPED") {
      throw new Error(`このステップは既に完了またはスキップ済みです`);
    }

    if (step.workflow.status !== "ACTIVE") {
      throw new Error("ワークフローがアクティブ状態ではありません");
    }

    const updated = await tx.workflowStep.update({
      where: { id: stepId },
      data: {
        status: "SKIPPED",
        completedAt: now,
      },
    });

    await activateNextStep(tx, step.workflowId, step.sortOrder, now);

    return updated;
  });

  return skippedStep;
}

/**
 * Cancel an entire workflow. Sets all non-completed steps to SKIPPED
 * and marks the workflow as CANCELLED.
 */
export async function cancelWorkflow(workflowId: string): Promise<Workflow> {
  const now = new Date();

  // All validation is performed inside the transaction to prevent
  // TOCTOU race conditions.
  const cancelled = await prisma.$transaction(async (tx: TxClient) => {
    const workflow = await tx.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`ワークフローが見つかりません: ${workflowId}`);
    }

    if (workflow.status !== "ACTIVE") {
      throw new Error("アクティブなワークフローのみキャンセルできます");
    }

    // Skip all non-completed steps
    await tx.workflowStep.updateMany({
      where: {
        workflowId,
        status: { in: ["PENDING", "ACTIVE", "WAITING"] },
      },
      data: {
        status: "SKIPPED",
        completedAt: now,
      },
    });

    // Cancel the workflow
    return tx.workflow.update({
      where: { id: workflowId },
      data: {
        status: "CANCELLED",
        completedAt: now,
      },
    });
  });

  return cancelled;
}
