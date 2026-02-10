import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string; bid: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, bid } = await context.params;

    const customerBusiness = await prisma.customerBusiness.findFirst({
      where: { id: bid, customerId: id, deletedAt: null },
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
    console.error("CustomerBusiness GET error:", error);
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

    const existing = await prisma.customerBusiness.findFirst({
      where: { id: bid, customerId: id, deletedAt: null },
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
    console.error("CustomerBusiness PUT error:", error);
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

    const existing = await prisma.customerBusiness.findFirst({
      where: { id: bid, customerId: id, deletedAt: null },
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
    console.error("CustomerBusiness DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
