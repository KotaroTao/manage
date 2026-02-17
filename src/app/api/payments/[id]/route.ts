import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { getPartnerAccess } from "@/lib/access-control";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED"],
  APPROVED: ["PAID"],
  PAID: ["CANCELLED"],
  CANCELLED: [],
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const access = await getPartnerAccess(user);

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(access && { partnerId: access.partnerId }),
      },
      include: {
        partner: { select: { id: true, name: true, company: true, bankName: true, bankBranch: true, bankAccountType: true, bankAccountNumber: true, bankAccountHolder: true } },
        category: { select: { id: true, name: true, parentId: true, parent: { select: { id: true, name: true } } } },
        workflow: { select: { id: true, status: true } },
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true } },
            business: { select: { id: true, name: true } },
          },
        },
        comments: {
          include: {
            user: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ data: payment });
  } catch (error) {
    logger.error("Payment GET error:", error, request);
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
    const access = await getPartnerAccess(user);

    const existing = await prisma.payment.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(access && { partnerId: access.partnerId }),
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    const body = await request.json();
    const { status, amount, tax, withholdingTax, type, categoryId, period, dueDate, note, adjustmentReason } = body;

    // Validate status transition
    if (status && status !== existing.status) {
      const allowed = VALID_TRANSITIONS[existing.status] || [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          {
            error: `ステータス遷移 ${existing.status} → ${status} は許可されていません。許可: ${allowed.join(", ") || "なし"}`,
          },
          { status: 400 },
        );
      }

      // 承認ルールベースの権限チェック
      const ROLE_LEVEL: Record<string, number> = { PARTNER: 0, MEMBER: 1, MANAGER: 2, ADMIN: 3 };
      const userLevel = ROLE_LEVEL[user.role] ?? 0;

      if (status === "APPROVED" || status === "PAID") {
        const totalAmt = existing.totalAmount;
        const matchingRule = await prisma.approvalRule.findFirst({
          where: {
            isActive: true,
            minAmount: { lte: totalAmt },
            OR: [{ maxAmount: null }, { maxAmount: { gt: totalAmt } }],
          },
          orderBy: { sortOrder: "asc" },
        });
        if (matchingRule) {
          const requiredLevel = ROLE_LEVEL[matchingRule.requiredRole] ?? 0;
          if (userLevel < requiredLevel) {
            return NextResponse.json(
              { error: `この金額(${totalAmt.toLocaleString()}円)の${status === "APPROVED" ? "承認" : "支払確定"}には${matchingRule.requiredRole}権限が必要です` },
              { status: 403 },
            );
          }
        } else {
          // ルールなし: デフォルトの権限チェック
          if (status === "APPROVED" && userLevel < ROLE_LEVEL.MANAGER) {
            return NextResponse.json({ error: "承認にはManager権限が必要です" }, { status: 403 });
          }
          if (status === "PAID" && userLevel < ROLE_LEVEL.ADMIN) {
            return NextResponse.json({ error: "支払確定にはAdmin権限が必要です" }, { status: 403 });
          }
        }
      }

      if (status === "CANCELLED" && user.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: 取消にはAdmin権限が必要です" }, { status: 403 });
      }
    }

    // PAID状態での金額変更は理由が必須
    if (existing.status === "PAID" && !status && (amount !== undefined || tax !== undefined || withholdingTax !== undefined)) {
      if (!adjustmentReason || !adjustmentReason.trim()) {
        return NextResponse.json(
          { error: "支払済の金額変更には理由(adjustmentReason)が必須です" },
          { status: 400 },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;

    // Amount updates (always recalculate totals)
    const newAmount = amount ?? existing.amount;
    const newTax = tax ?? existing.tax;
    const newWithholdingTax = withholdingTax ?? existing.withholdingTax;

    if (amount !== undefined || tax !== undefined || withholdingTax !== undefined) {
      updateData.amount = newAmount;
      updateData.tax = newTax;
      updateData.totalAmount = newAmount + newTax;
      updateData.withholdingTax = newWithholdingTax;
      updateData.netAmount = newAmount + newTax - newWithholdingTax;
    }

    if (adjustmentReason !== undefined) updateData.adjustmentReason = adjustmentReason;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;
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
      action: status === "CANCELLED" ? "CANCEL" : "UPDATE",
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
      changeType: status === "CANCELLED" ? "CANCEL" : "UPDATE",
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    logger.error("Payment PUT error:", error, request);
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

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden: Manager role required" }, { status: 403 });
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
        { error: "下書き状態の支払いのみ削除できます" },
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

    return NextResponse.json({ data: null, message: "Payment deleted" });
  } catch (error) {
    logger.error("Payment DELETE error:", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
