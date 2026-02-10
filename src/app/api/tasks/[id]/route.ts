import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { getBusinessIdFilter, canWrite } from "@/lib/access-control";

type RouteContext = { params: Promise<{ id: string }> };

/** パートナー向け: タスクのビジネスIDがアクセス可能か判定するwhere句 */
function taskAccessWhere(allowedBizIds: string[] | undefined) {
  if (!allowedBizIds) return {};
  return {
    OR: [
      { businessId: { in: allowedBizIds } },
      { customerBusiness: { businessId: { in: allowedBizIds } } },
    ],
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "tasks");

    const task = await prisma.task.findFirst({
      where: { id, deletedAt: null, ...taskAccessWhere(allowedBizIds) },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true } },
            business: { select: { id: true, name: true } },
          },
        },
        business: { select: { id: true, name: true } },
        tags: { include: { tag: true } },
      },
    });

    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ data: task });
  } catch (error) {
    console.error("Task GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "tasks");

    // パートナーの書き込み権限チェック
    if (allowedBizIds && !(await canWrite(user))) {
      return NextResponse.json({ error: "Forbidden: 編集権限がありません" }, { status: 403 });
    }

    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null, ...taskAccessWhere(allowedBizIds) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();
    const { title, description, assigneeId, priority, dueDate, status } = body;

    // If status changed to DONE, set completedAt
    const completedAt =
      status === "DONE" && existing.status !== "DONE"
        ? new Date()
        : status === "ACTIVE" && existing.status === "DONE"
          ? null
          : undefined;

    const updated = await prisma.task.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description || null }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(priority !== undefined && { priority }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(status !== undefined && { status }),
        ...(completedAt !== undefined && { completedAt }),
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "Task",
      entityId: id,
      before: existing,
      after: updated,
      request,
    });

    await createDataVersion({
      entity: "Task",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Task PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "tasks");

    // パートナーの書き込み権限チェック
    if (allowedBizIds && !(await canWrite(user))) {
      return NextResponse.json({ error: "Forbidden: 削除権限がありません" }, { status: 403 });
    }

    const existing = await prisma.task.findFirst({
      where: { id, deletedAt: null, ...taskAccessWhere(allowedBizIds) },
    });

    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      action: "SOFT_DELETE",
      entity: "Task",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ data: null, message: "Task deleted" });
  } catch (error) {
    console.error("Task DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
