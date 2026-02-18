import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { getBusinessIdFilter, canWrite } from "@/lib/access-control";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string; bid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, bid } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    const customerBusiness = await prisma.customerBusiness.findFirst({
      where: {
        id: bid,
        customerId: id,
        deletedAt: null,
        ...(allowedBizIds && { businessId: { in: allowedBizIds } }),
      },
      include: {
        customer: { select: { id: true, name: true, company: true } },
        business: { select: { id: true, name: true, code: true, colorCode: true } },
        assignee: { select: { id: true, name: true, email: true } },
        workflows: {
          include: {
            template: { select: { name: true } },
            steps: {
              include: { assignee: { select: { id: true, name: true } } },
              orderBy: { sortOrder: "asc" },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        tasks: {
          where: { deletedAt: null },
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { dueDate: "asc" },
        },
        activityNotes: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { contactedAt: "desc" },
          take: 20,
        },
        sharedPages: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customerBusiness) {
      return NextResponse.json(
        { error: "CustomerBusiness not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: customerBusiness });
  } catch (error) {
    logger.error("CustomerBusiness GET error:", error, request);
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

    const { id, bid } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    // パートナーの書き込み権限チェック
    if (allowedBizIds && !(await canWrite(user))) {
      return NextResponse.json({ error: "Forbidden: 編集権限がありません" }, { status: 403 });
    }

    const existing = await prisma.customerBusiness.findFirst({
      where: {
        id: bid,
        customerId: id,
        deletedAt: null,
        ...(allowedBizIds && { businessId: { in: allowedBizIds } }),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "CustomerBusiness not found" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
      nextActionDate,
      nextActionMemo,
      customFields,
      status,
      assigneeId,
      contractStartDate,
      contractEndDate,
      monthlyFee,
      note,
    } = body;

    const updated = await prisma.customerBusiness.update({
      where: { id: bid },
      data: {
        ...(nextActionDate !== undefined && {
          nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
        }),
        ...(nextActionMemo !== undefined && { nextActionMemo: nextActionMemo || null }),
        ...(customFields !== undefined && { customFields }),
        ...(status !== undefined && { status }),
        ...(assigneeId !== undefined && { assigneeId }),
        ...(contractStartDate !== undefined && {
          contractStartDate: contractStartDate ? new Date(contractStartDate) : null,
        }),
        ...(contractEndDate !== undefined && {
          contractEndDate: contractEndDate ? new Date(contractEndDate) : null,
        }),
        ...(monthlyFee !== undefined && { monthlyFee }),
        ...(note !== undefined && { note: note || null }),
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "CustomerBusiness",
      entityId: bid,
      before: existing,
      after: updated,
      request,
    });

    await createDataVersion({
      entity: "CustomerBusiness",
      entityId: bid,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error("CustomerBusiness PUT error:", error, request);
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

    const { id, bid } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    // パートナーの書き込み権限チェック
    if (allowedBizIds && !(await canWrite(user))) {
      return NextResponse.json({ error: "Forbidden: 削除権限がありません" }, { status: 403 });
    }

    const existing = await prisma.customerBusiness.findFirst({
      where: {
        id: bid,
        customerId: id,
        deletedAt: null,
        ...(allowedBizIds && { businessId: { in: allowedBizIds } }),
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "CustomerBusiness not found" },
        { status: 404 },
      );
    }

    await prisma.customerBusiness.update({
      where: { id: bid },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      action: "SOFT_DELETE",
      entity: "CustomerBusiness",
      entityId: bid,
      before: existing,
      request,
    });

    return NextResponse.json({ data: null, message: "CustomerBusiness deleted" });
  } catch (error) {
    logger.error("CustomerBusiness DELETE error:", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
