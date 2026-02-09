import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const existing = await prisma.workflowStep.findUnique({
      where: { id },
      include: {
        workflow: {
          include: { steps: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Workflow step not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { status, assigneeId, note } = body;

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (assigneeId !== undefined) updateData.assigneeId = assigneeId;
    if (note !== undefined) updateData.note = note || null;

    // If status changes to DONE, set completedAt
    if (status === "DONE" && existing.status !== "DONE") {
      updateData.completedAt = new Date();
    }

    const updated = await prisma.workflowStep.update({
      where: { id },
      data: updateData,
      include: {
        assignee: { select: { id: true, name: true } },
      },
    });

    // If step was completed, activate the next pending step
    if (status === "DONE" && existing.status !== "DONE") {
      const workflowSteps = existing.workflow.steps;
      const currentIndex = workflowSteps.findIndex((s) => s.id === id);

      // Find next PENDING step after current
      const nextPendingStep = workflowSteps.find(
        (s, i) => i > currentIndex && s.status === "PENDING",
      );

      if (nextPendingStep) {
        // Calculate due date for next step based on daysFromPrevious
        const nextStepTemplate = await prisma.workflowStepTemplate.findUnique({
          where: { id: nextPendingStep.stepTemplateId || "" },
        });

        const daysFromPrevious = nextStepTemplate?.daysFromPrevious ?? 7;
        const nextDueDate = new Date();
        nextDueDate.setDate(nextDueDate.getDate() + daysFromPrevious);

        await prisma.workflowStep.update({
          where: { id: nextPendingStep.id },
          data: {
            status: "ACTIVE",
            dueDate: nextDueDate,
          },
        });
      }

      // Check if all steps are DONE (or SKIPPED)
      const allStepsAfterUpdate = await prisma.workflowStep.findMany({
        where: { workflowId: existing.workflowId },
      });

      const allCompleted = allStepsAfterUpdate.every(
        (s) => s.status === "DONE" || s.status === "SKIPPED",
      );

      if (allCompleted) {
        await prisma.workflow.update({
          where: { id: existing.workflowId },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
          },
        });
      }
    }

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "WorkflowStep",
      entityId: id,
      before: {
        status: existing.status,
        assigneeId: existing.assigneeId,
        note: existing.note,
      },
      after: {
        status: updated.status,
        assigneeId: updated.assigneeId,
        note: updated.note,
      },
      request,
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("WorkflowStep PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
