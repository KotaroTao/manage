import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const customerBusinesses = await prisma.customerBusiness.findMany({
      where: { customerId: id, deletedAt: null },
      include: {
        business: { select: { id: true, name: true, code: true, colorCode: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: customerBusinesses });
  } catch (error) {
    console.error("CustomerBusinesses GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    // Verify customer exists
    const customer = await prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const body = await request.json();
    const { businessId, assigneeId, nextActionDate, nextActionMemo, customFields, note, status } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 },
      );
    }

    if (!assigneeId) {
      return NextResponse.json(
        { error: "assigneeId is required" },
        { status: 400 },
      );
    }

    // Check for duplicate (only among non-soft-deleted records)
    const existing = await prisma.customerBusiness.findFirst({
      where: { customerId: id, businessId, deletedAt: null },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Customer is already linked to this business" },
        { status: 400 },
      );
    }

    const customerBusiness = await prisma.customerBusiness.create({
      data: {
        customerId: id,
        businessId,
        assigneeId,
        nextActionDate: nextActionDate ? new Date(nextActionDate) : null,
        nextActionMemo: nextActionMemo || null,
        customFields: customFields || {},
        note: note || null,
        status: status || "ACTIVE",
      },
      include: {
        business: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "CustomerBusiness",
      entityId: customerBusiness.id,
      after: customerBusiness,
      request,
    });

    await createDataVersion({
      entity: "CustomerBusiness",
      entityId: customerBusiness.id,
      data: customerBusiness,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: customerBusiness }, { status: 201 });
  } catch (error) {
    console.error("CustomerBusiness POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
