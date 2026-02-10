import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getBusinessIdFilter } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    // Get user's alert setting
    const notificationSetting = await prisma.notificationSetting.findUnique({
      where: { userId: user.id },
    });
    const alertDaysBefore = notificationSetting?.alertDaysBefore ?? 3;

    const approachingThreshold = new Date(now);
    approachingThreshold.setDate(approachingThreshold.getDate() + alertDaysBefore);

    // Overdue WorkflowSteps
    const overdueSteps = await prisma.workflowStep.findMany({
      where: {
        assigneeId: user.id,
        status: "ACTIVE",
        dueDate: { lt: now },
      },
      include: {
        workflow: {
          include: {
            customerBusiness: {
              include: {
                customer: { select: { name: true } },
                business: { select: { name: true } },
              },
            },
          },
        },
        assignee: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    // Overdue Tasks
    const overdueTasks = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        status: "ACTIVE",
        dueDate: { lt: now },
        deletedAt: null,
      },
      include: {
        customerBusiness: {
          include: {
            customer: { select: { name: true } },
            business: { select: { name: true } },
          },
        },
        assignee: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    // Approaching WorkflowSteps
    const approachingSteps = await prisma.workflowStep.findMany({
      where: {
        assigneeId: user.id,
        status: "ACTIVE",
        dueDate: { gte: now, lte: approachingThreshold },
      },
      include: {
        workflow: {
          include: {
            customerBusiness: {
              include: {
                customer: { select: { name: true } },
                business: { select: { name: true } },
              },
            },
          },
        },
        assignee: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    // Approaching Tasks
    const approachingTasksList = await prisma.task.findMany({
      where: {
        assigneeId: user.id,
        status: "ACTIVE",
        dueDate: { gte: now, lte: approachingThreshold },
        deletedAt: null,
      },
      include: {
        customerBusiness: {
          include: {
            customer: { select: { name: true } },
            business: { select: { name: true } },
          },
        },
        assignee: { select: { name: true } },
      },
      orderBy: { dueDate: "asc" },
    });

    // Missing next action
    const missingNextAction = await prisma.customerBusiness.findMany({
      where: {
        assigneeId: user.id,
        nextActionDate: null,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
        business: { select: { name: true } },
      },
    });

    // Today actions
    const todayActions = await prisma.customerBusiness.findMany({
      where: {
        assigneeId: user.id,
        nextActionDate: { gte: todayStart, lte: todayEnd },
        deletedAt: null,
      },
      include: {
        customer: { select: { name: true } },
        business: { select: { name: true } },
      },
      orderBy: { nextActionDate: "asc" },
    });

    // Business summary (パートナーは割当事業のみ)
    const allowedBizIds = await getBusinessIdFilter(user);
    const bizWhere: Record<string, unknown> = { isActive: true };
    if (allowedBizIds) bizWhere.id = { in: allowedBizIds };

    const businesses = await prisma.business.findMany({
      where: bizWhere,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            customerBusinesses: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    const businessSummary = await Promise.all(
      businesses.map(async (biz) => {
        const activeWorkflows = await prisma.workflow.count({
          where: {
            customerBusiness: { businessId: biz.id, deletedAt: null },
            status: "ACTIVE",
          },
        });
        const missingActions = await prisma.customerBusiness.count({
          where: {
            businessId: biz.id,
            nextActionDate: null,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        return {
          businessId: biz.id,
          businessName: biz.name,
          customerCount: biz._count.customerBusinesses,
          activeWorkflows,
          missingNextActions: missingActions,
        };
      }),
    );

    // Payment summary - pending payments this month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const pendingPayments = await prisma.payment.aggregate({
      where: {
        status: { in: ["DRAFT", "PENDING", "APPROVED"] },
        createdAt: { gte: monthStart, lte: monthEnd },
        deletedAt: null,
      },
      _sum: { totalAmount: true },
      _count: true,
    });

    return NextResponse.json({
      data: {
        overdueTasks: [...overdueSteps.map((s) => ({ ...s, type: "workflow_step" })), ...overdueTasks.map((t) => ({ ...t, type: "task" }))],
        approachingTasks: [...approachingSteps.map((s) => ({ ...s, type: "workflow_step" })), ...approachingTasksList.map((t) => ({ ...t, type: "task" }))],
        missingNextAction,
        todayActions,
        businessSummary,
        paymentSummary: {
          pendingCount: pendingPayments._count,
          pendingTotal: pendingPayments._sum.totalAmount ?? 0,
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
