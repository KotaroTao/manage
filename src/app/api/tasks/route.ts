import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { getBusinessIdFilter, canEditInBusiness } from "@/lib/access-control";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const assigneeId = searchParams.get("assigneeId") || undefined;
    const status = searchParams.get("status") || undefined;
    const businessId = searchParams.get("businessId") || undefined;
    const priority = searchParams.get("priority") || undefined;
    const query = searchParams.get("query") || undefined;
    const dateFrom = searchParams.get("dueDateFrom") || searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dueDateTo") || searchParams.get("dateTo") || undefined;
    const sortBy = searchParams.get("sortBy") || "dueDate";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * pageSize;

    // パートナーの場合: アクセス可能な事業に限定
    const allowedBizIds = await getBusinessIdFilter(user, "tasks");

    // 事業フィルタ: パートナー制限と businessId の交差を取る
    const effectiveBizIds = allowedBizIds
      ? businessId
        ? allowedBizIds.includes(businessId) ? [businessId] : []
        : allowedBizIds
      : businessId
        ? [businessId]
        : null;

    // Build Task filter
    const taskWhere: Record<string, unknown> = { deletedAt: null };
    if (assigneeId) taskWhere.assigneeId = assigneeId;
    if (status) taskWhere.status = status;
    if (priority) taskWhere.priority = priority;
    if (query) taskWhere.title = { contains: query, mode: "insensitive" };
    if (effectiveBizIds) {
      taskWhere.OR = [
        { businessId: { in: effectiveBizIds } },
        { customerBusiness: { businessId: { in: effectiveBizIds } } },
      ];
    }
    if (dateFrom || dateTo) {
      taskWhere.dueDate = {};
      if (dateFrom) (taskWhere.dueDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (taskWhere.dueDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    // Build WorkflowStep filter
    const stepWhere: Record<string, unknown> = {};
    if (assigneeId) stepWhere.assigneeId = assigneeId;
    if (query) stepWhere.title = { contains: query, mode: "insensitive" };
    if (status) {
      if (status === "ACTIVE") stepWhere.status = "ACTIVE";
      else if (status === "DONE") stepWhere.status = "DONE";
    }
    if (effectiveBizIds) {
      stepWhere.workflow = {
        customerBusiness: { businessId: { in: effectiveBizIds }, deletedAt: null },
      };
    }
    if (dateFrom || dateTo) {
      stepWhere.dueDate = {};
      if (dateFrom) (stepWhere.dueDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (stepWhere.dueDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    // Fetch both in parallel
    const [tasks, workflowSteps, taskCount, stepCount] = await Promise.all([
      prisma.task.findMany({
        where: taskWhere,
        include: {
          assignee: { select: { id: true, name: true } },
          customerBusiness: {
            include: {
              customer: { select: { name: true } },
              business: { select: { name: true } },
            },
          },
          business: { select: { name: true } },
        },
        orderBy: { [sortBy === "priority" ? "priority" : "dueDate"]: sortOrder },
      }),
      prisma.workflowStep.findMany({
        where: stepWhere,
        include: {
          assignee: { select: { id: true, name: true } },
          workflow: {
            include: {
              template: { select: { name: true } },
              customerBusiness: {
                include: {
                  customer: { select: { name: true } },
                  business: { select: { name: true } },
                },
              },
            },
          },
        },
        orderBy: { dueDate: sortOrder },
      }),
      prisma.task.count({ where: taskWhere }),
      prisma.workflowStep.count({ where: stepWhere }),
    ]);

    // Unify format — return nested objects matching frontend TaskItem interface
    const unifiedTasks = tasks.map((t) => ({
      id: t.id,
      type: "TASK" as const,
      title: t.title,
      description: null,
      status: t.status,
      priority: t.priority,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
      assignee: { id: t.assignee.id, name: t.assignee.name },
      business: t.business ? { id: (t as Record<string, unknown>).businessId as string, name: t.business.name, colorCode: "" } : null,
      customerBusiness: t.customerBusiness
        ? {
            id: (t as Record<string, unknown>).customerBusinessId as string,
            customer: { id: "", name: t.customerBusiness.customer?.name || "", company: null },
            business: { id: "", name: t.customerBusiness.business?.name || "" },
          }
        : null,
    }));

    const unifiedSteps = workflowSteps.map((s) => ({
      id: s.id,
      type: "WORKFLOW_STEP" as const,
      title: s.title,
      description: null,
      status: s.status,
      priority: "MEDIUM",
      dueDate: s.dueDate,
      completedAt: s.completedAt,
      createdAt: s.createdAt,
      assignee: { id: s.assignee.id, name: s.assignee.name },
      business: null,
      customerBusiness: s.workflow.customerBusiness
        ? {
            id: s.workflow.customerBusiness.id || "",
            customer: { id: "", name: s.workflow.customerBusiness.customer?.name || "", company: null },
            business: { id: "", name: s.workflow.customerBusiness.business?.name || "" },
          }
        : null,
    }));

    // Merge and sort
    const allItems = [...unifiedTasks, ...unifiedSteps].sort((a, b) => {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    });

    const totalCount = taskCount + stepCount;
    const totalPages = Math.ceil(totalCount / pageSize);
    const paginated = allItems.slice(skip, skip + pageSize);

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error("Tasks GET error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      title,
      description,
      customerBusinessId,
      businessId,
      assigneeId,
      priority,
      dueDate,
    } = body;

    if (!title || typeof title !== "string" || title.trim() === "") {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    if (!assigneeId) {
      return NextResponse.json({ error: "assigneeId is required" }, { status: 400 });
    }
    if (!dueDate) {
      return NextResponse.json({ error: "dueDate is required" }, { status: 400 });
    }

    // パートナーの書き込み権限チェック
    if (businessId && !(await canEditInBusiness(user, businessId))) {
      return NextResponse.json({ error: "この事業への編集権限がありません" }, { status: 403 });
    }

    const task = await prisma.task.create({
      data: {
        title: title.trim(),
        description: description || null,
        customerBusinessId: customerBusinessId || null,
        businessId: businessId || null,
        assigneeId,
        priority: priority || "MEDIUM",
        dueDate: new Date(dueDate),
        status: "ACTIVE",
      },
      include: {
        assignee: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Task",
      entityId: task.id,
      after: task,
      request,
    });

    await createDataVersion({
      entity: "Task",
      entityId: task.id,
      data: task,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: task }, { status: 201 });
  } catch (error) {
    logger.error("Task POST error", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
