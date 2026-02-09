import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED"],
  APPROVED: ["PAID"],
  PAID: [],
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const payment = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
      include: {
        partner: { select: { id: true, name: true, company: true } },
        workflow: { select: { id: true, status: true } },
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true } },
            business: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error("Payment GET error:", error);
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

    const existing = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status, amount, tax, type, period, dueDate, note } = body;

    // Validate status transition
    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${existing.status} to ${status}. Allowed: ${allowed.join(", ") || "none"}`,
          },
          { status: 400 },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (amount !== undefined) {
      updateData.amount = amount;
      updateData.totalAmount = amount + (tax ?? existing.tax);
    }
    if (tax !== undefined) {
      updateData.tax = tax;
      updateData.totalAmount = (amount ?? existing.amount) + tax;
    }
    if (type !== undefined) updateData.type = type;
    if (period !== undefined) updateData.period = period || null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (note !== undefined) updateData.note = note || null;

    // Set paidAt when status transitions to PAID
    if (status === "PAID" && existing.status !== "PAID") {
      updateData.paidAt = new Date();
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: updateData,
      include: {
        partner: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "UPDATE",
      entity: "Payment",
      entityId: id,
      before: existing,
      after: updated,
      request,
    });

    await createDataVersion({
      entity: "Payment",
      entityId: id,
      data: updated,
      changedBy: user.id,
      changeType: "UPDATE",
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Payment PUT error:", error);
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

    const existing = await prisma.payment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    if (existing.status !== "DRAFT") {
      return NextResponse.json(
        { error: "Only DRAFT payments can be deleted" },
        { status: 400 },
      );
    }

    await prisma.payment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await writeAuditLog({
      userId: user.id,
      action: "SOFT_DELETE",
      entity: "Payment",
      entityId: id,
      before: existing,
      request,
    });

    return NextResponse.json({ message: "Payment deleted", id });
  } catch (error) {
    console.error("Payment DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
