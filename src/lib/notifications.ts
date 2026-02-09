import prisma from "@/lib/prisma";
import type { LoginAlert, AlertItem } from "@/types";

/**
 * Default number of days to look ahead for approaching deadlines
 * when the user has no NotificationSetting record.
 */
const DEFAULT_ALERT_DAYS_BEFORE = 3;

// ============================================================
// Query result shapes (explicit types for strict mode)
// ============================================================

interface TaskQueryResult {
  id: string;
  title: string;
  dueDate: Date;
  customerBusiness: {
    id: string;
    customer: { name: string };
    business: { name: string };
  } | null;
}

interface StepQueryResult {
  id: string;
  title: string;
  dueDate: Date;
  workflow: {
    customerBusiness: {
      id: string;
      customer: { name: string };
      business: { name: string };
    };
  };
}

interface ApproachingCBResult {
  id: string;
  nextActionDate: Date | null;
  nextActionMemo: string | null;
  customer: { name: string };
  business: { name: string };
}

interface MissingCBResult {
  id: string;
  customer: { name: string };
  business: { name: string };
}

/**
 * Generate transient login alerts for a user.
 *
 * This function queries the database for:
 * 1. Overdue tasks and workflow steps (past their dueDate and not completed)
 * 2. Approaching deadlines (within N days, based on user's NotificationSetting)
 * 3. CustomerBusiness records missing a nextActionDate
 *
 * Returns structured alert data without persisting anything to the Notification table,
 * making these alerts ephemeral / session-based.
 *
 * @param userId - The ID of the logged-in user
 * @returns Array of LoginAlert objects grouped by alert type
 */
export async function generateLoginAlerts(
  userId: string,
): Promise<LoginAlert[]> {
  const alerts: LoginAlert[] = [];

  // Fetch the user's notification setting for alertDaysBefore
  const setting = await prisma.notificationSetting.findUnique({
    where: { userId },
    select: { alertDaysBefore: true, showAllBusinesses: true },
  });

  const alertDaysBefore = setting?.alertDaysBefore ?? DEFAULT_ALERT_DAYS_BEFORE;
  const showAll = setting?.showAllBusinesses ?? false;

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const approachingThreshold = new Date(todayStart);
  approachingThreshold.setDate(
    approachingThreshold.getDate() + alertDaysBefore,
  );

  // Build the assignee filter: either this user only, or all (for managers)
  const assigneeFilter = showAll ? {} : { assigneeId: userId };

  // Execute all queries in parallel
  const [
    overdueTasks,
    overdueSteps,
    approachingTasks,
    approachingSteps,
    approachingNextActions,
    missingNextAction,
  ] = await Promise.all([
    // --- Overdue tasks ---
    prisma.task.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        deletedAt: null,
        dueDate: { lt: todayStart },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        customerBusiness: {
          select: {
            id: true,
            customer: { select: { name: true } },
            business: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),

    // --- Overdue workflow steps ---
    prisma.workflowStep.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        dueDate: { lt: todayStart },
        workflow: { status: "ACTIVE" },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        workflow: {
          select: {
            customerBusiness: {
              select: {
                id: true,
                customer: { select: { name: true } },
                business: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),

    // --- Approaching deadline: tasks ---
    prisma.task.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        deletedAt: null,
        dueDate: {
          gte: todayStart,
          lte: approachingThreshold,
        },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        customerBusiness: {
          select: {
            id: true,
            customer: { select: { name: true } },
            business: { select: { name: true } },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),

    // --- Approaching deadline: workflow steps ---
    prisma.workflowStep.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        dueDate: {
          gte: todayStart,
          lte: approachingThreshold,
        },
        workflow: { status: "ACTIVE" },
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        workflow: {
          select: {
            customerBusiness: {
              select: {
                id: true,
                customer: { select: { name: true } },
                business: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { dueDate: "asc" },
    }),

    // --- Approaching deadline: nextActionDate on CustomerBusiness ---
    prisma.customerBusiness.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        deletedAt: null,
        nextActionDate: {
          gte: todayStart,
          lte: approachingThreshold,
        },
      },
      select: {
        id: true,
        nextActionDate: true,
        nextActionMemo: true,
        customer: { select: { name: true } },
        business: { select: { name: true } },
      },
      orderBy: { nextActionDate: "asc" },
    }),

    // --- Missing nextActionDate ---
    prisma.customerBusiness.findMany({
      where: {
        ...assigneeFilter,
        status: "ACTIVE",
        deletedAt: null,
        nextActionDate: null,
      },
      select: {
        id: true,
        customer: { select: { name: true } },
        business: { select: { name: true } },
      },
    }),
  ]);

  // --- Build overdue alert ---
  const overdueItems: AlertItem[] = [
    ...(overdueTasks as TaskQueryResult[]).map((t) => ({
      id: t.id,
      label: t.customerBusiness
        ? `[${t.customerBusiness.business.name}] ${t.customerBusiness.customer.name} - ${t.title}`
        : t.title,
      dueDate: t.dueDate,
      entityType: "task" as const,
      entityId: t.id,
    })),
    ...(overdueSteps as StepQueryResult[]).map((s) => ({
      id: s.id,
      label: `[${s.workflow.customerBusiness.business.name}] ${s.workflow.customerBusiness.customer.name} - ${s.title}`,
      dueDate: s.dueDate,
      entityType: "workflowStep" as const,
      entityId: s.id,
    })),
  ];

  if (overdueItems.length > 0) {
    alerts.push({
      type: "overdue",
      title: "期限超過",
      message: `${overdueItems.length}件のタスク・ステップが期限を超過しています`,
      count: overdueItems.length,
      items: overdueItems,
    });
  }

  // --- Build approaching deadline alert ---
  const approachingItems: AlertItem[] = [
    ...(approachingTasks as TaskQueryResult[]).map((t) => ({
      id: t.id,
      label: t.customerBusiness
        ? `[${t.customerBusiness.business.name}] ${t.customerBusiness.customer.name} - ${t.title}`
        : t.title,
      dueDate: t.dueDate,
      entityType: "task" as const,
      entityId: t.id,
    })),
    ...(approachingSteps as StepQueryResult[]).map((s) => ({
      id: s.id,
      label: `[${s.workflow.customerBusiness.business.name}] ${s.workflow.customerBusiness.customer.name} - ${s.title}`,
      dueDate: s.dueDate,
      entityType: "workflowStep" as const,
      entityId: s.id,
    })),
    ...(approachingNextActions as ApproachingCBResult[]).map((cb) => ({
      id: cb.id,
      label: `[${cb.business.name}] ${cb.customer.name} - ${cb.nextActionMemo ?? "次回アクション"}`,
      dueDate: cb.nextActionDate,
      entityType: "customerBusiness" as const,
      entityId: cb.id,
    })),
  ];

  if (approachingItems.length > 0) {
    alerts.push({
      type: "approaching",
      title: "期限間近",
      message: `${approachingItems.length}件が${alertDaysBefore}日以内に期限を迎えます`,
      count: approachingItems.length,
      items: approachingItems,
    });
  }

  // --- Build missing nextActionDate alert ---
  const missingItems: AlertItem[] = (
    missingNextAction as MissingCBResult[]
  ).map((cb) => ({
    id: cb.id,
    label: `[${cb.business.name}] ${cb.customer.name}`,
    entityType: "customerBusiness" as const,
    entityId: cb.id,
  }));

  if (missingItems.length > 0) {
    alerts.push({
      type: "missingAction",
      title: "次回アクション未設定",
      message: `${missingItems.length}件の顧客×事業で次回アクション日が未設定です`,
      count: missingItems.length,
      items: missingItems,
    });
  }

  return alerts;
}
