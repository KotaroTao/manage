import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

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
    const dateFrom = searchParams.get("dateFrom") || undefined;
    const dateTo = searchParams.get("dateTo") || undefined;
    const sortBy = searchParams.get("sortBy") || "dueDate";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * perPage;

    // Build Task filter
    const taskWhere: Record<string, unknown> = { deletedAt: null };
    if (assigneeId) taskWhere.assigneeId = assigneeId;
    if (status) taskWhere.status = status;
    if (businessId) taskWhere.businessId = businessId;
    if (priority) taskWhere.priority = priority;
    if (dateFrom || dateTo) {
      taskWhere.dueDate = {};
      if (dateFrom) (taskWhere.dueDate as Record<string, unknown>).gte = new Date(dateFrom);
      if (dateTo) (taskWhere.dueDate as Record<string, unknown>).lte = new Date(dateTo);
    }

    // Build WorkflowStep filter
    const stepWhere: Record<string, unknown> = {};
    if (assigneeId) stepWhere.assigneeId = assigneeId;
    if (status) {
      // Map task statuses to step statuses
      if (status === "ACTIVE") stepWhere.status = "ACTIVE";
      else if (status === "DONE") stepWhere.status = "DONE";
    }
    if (businessId) {
      stepWhere.workflow = {
        customerBusiness: { businessId, deletedAt: null },
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

    // Unify format
    const unifiedTasks = tasks.map((t) => ({
      id: t.id,
      type: "task" as const,
      title: t.title,
      customerName: t.customerBusiness?.customer?.name || null,
      businessName: t.customerBusiness?.business?.name || t.business?.name || null,
      assigneeName: t.assignee.name,
      assigneeId: t.assignee.id,
      status: t.status,
      dueDate: t.dueDate,
      priority: t.priority,
      completedAt: t.completedAt,
      createdAt: t.createdAt,
    }));

    const unifiedSteps = workflowSteps.map((s) => ({
      id: s.id,
      type: "workflow_step" as const,
      title: s.title,
      customerName: s.workflow.customerBusiness?.customer?.name || null,
      businessName: s.workflow.customerBusiness?.business?.name || null,
      assigneeName: s.assignee.name,
      assigneeId: s.assignee.id,
      status: s.status,
      dueDate: s.dueDate,
      priority: null,
      completedAt: s.completedAt,
      workflowName: s.workflow.template?.name || null,
      createdAt: s.createdAt,
    }));

    // Merge and sort
    const allItems = [...unifiedTasks, ...unifiedSteps].sort((a, b) => {
      const aDate = new Date(a.dueDate).getTime();
      const bDate = new Date(b.dueDate).getTime();
      return sortOrder === "asc" ? aDate - bDate : bDate - aDate;
    });

    const total = taskCount + stepCount;
    const paginated = allItems.slice(skip, skip + perPage);

    return NextResponse.json({
      data: paginated,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    console.error("Tasks GET error:", error);
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

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("Task POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
