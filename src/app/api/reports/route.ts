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

    const { searchParams } = new URL(request.url);
    const months = Math.min(Math.max(parseInt(searchParams.get("months") || "6", 10) || 6, 1), 24);

    const allowedBizIds = await getBusinessIdFilter(user, "reports");

    // -------------------------------------------------------
    // 1. businessCustomerCounts
    //    Count of active CustomerBusiness per Business
    // -------------------------------------------------------
    const businesses = await prisma.business.findMany({
      where: {
        isActive: true,
        ...(allowedBizIds && { id: { in: allowedBizIds } }),
      },
      select: {
        name: true,
        colorCode: true,
        _count: {
          select: {
            customerBusinesses: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    const businessCustomerCounts = businesses.map((b) => ({
      businessName: b.name,
      colorCode: b.colorCode,
      count: b._count.customerBusinesses,
    }));

    // -------------------------------------------------------
    // 2. taskCompletion
    //    Total tasks this month vs completed tasks this month
    // -------------------------------------------------------
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const taskBaseWhere = {
      deletedAt: null,
      ...(allowedBizIds && {
        OR: [
          { businessId: { in: allowedBizIds } },
          { customerBusiness: { businessId: { in: allowedBizIds } } },
        ],
      }),
    };

    const [totalTasks, completedTasks] = await Promise.all([
      prisma.task.count({
        where: {
          ...taskBaseWhere,
          createdAt: { gte: monthStart, lte: monthEnd },
        },
      }),
      prisma.task.count({
        where: {
          ...taskBaseWhere,
          status: "DONE",
          completedAt: { gte: monthStart, lte: monthEnd },
        },
      }),
    ]);

    const taskCompletion = {
      total: totalTasks,
      completed: completedTasks,
      rate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    };

    // -------------------------------------------------------
    // 3. monthlyPaymentTrends
    //    Sum of totalAmount by period for the last N months (PAID only)
    // -------------------------------------------------------
    const periodList: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      periodList.push(`${yyyy}-${mm}`);
    }

    const payments = await prisma.payment.groupBy({
      by: ["period"],
      where: {
        status: "PAID",
        deletedAt: null,
        period: { in: periodList },
        ...(allowedBizIds && {
          customerBusiness: { businessId: { in: allowedBizIds } },
        }),
      },
      _sum: { totalAmount: true },
    });

    const paymentMap = new Map(
      payments.map((p) => [p.period, p._sum.totalAmount ?? 0]),
    );

    const monthlyPaymentTrends = periodList.map((period) => ({
      period,
      total: paymentMap.get(period) ?? 0,
    }));

    // -------------------------------------------------------
    // 4. userTaskLoads
    //    Count of active tasks (not DONE, deletedAt null) per assignee
    // -------------------------------------------------------
    const taskLoadsWhere = {
      status: "ACTIVE" as const,
      deletedAt: null,
      ...(allowedBizIds && {
        OR: [
          { businessId: { in: allowedBizIds } },
          { customerBusiness: { businessId: { in: allowedBizIds } } },
        ],
      }),
    };

    const taskLoads = await prisma.task.groupBy({
      by: ["assigneeId"],
      where: taskLoadsWhere,
      _count: { id: true },
    });

    const assigneeIds = taskLoads.map((t) => t.assigneeId);
    const assignees = await prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true },
    });

    const assigneeMap = new Map(assignees.map((u) => [u.id, u.name]));

    const userTaskLoads = taskLoads
      .map((t) => ({
        userName: assigneeMap.get(t.assigneeId) ?? "不明",
        taskCount: t._count.id,
      }))
      .sort((a, b) => b.taskCount - a.taskCount);

    // -------------------------------------------------------
    // Response
    // -------------------------------------------------------
    return NextResponse.json({
      data: {
        businessCustomerCounts,
        taskCompletion,
        monthlyPaymentTrends,
        userTaskLoads,
      },
    });
  } catch (error) {
    console.error("Reports error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
