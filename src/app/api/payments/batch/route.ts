import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PENDING"],
  PENDING: ["APPROVED"],
  APPROVED: ["PAID"],
  PAID: ["CANCELLED"],
  CANCELLED: [],
};

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden: Manager role required" }, { status: 403 });
    }

    const body = await request.json();
    const { paymentIds, status } = body;

    if (!paymentIds || !Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json({ error: "paymentIdsは必須です" }, { status: 400 });
    }

    if (!status) {
      return NextResponse.json({ error: "statusは必須です" }, { status: 400 });
    }

    // Role checks
    if (status === "APPROVED" && user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden: 承認にはManager権限が必要です" }, { status: 403 });
    }
    if (status === "PAID" && user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: 支払確定にはAdmin権限が必要です" }, { status: 403 });
    }

    const payments = await prisma.payment.findMany({
      where: {
        id: { in: paymentIds },
        deletedAt: null,
      },
    });

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const payment of payments) {
      const allowed = VALID_TRANSITIONS[payment.status] || [];
      if (!allowed.includes(status)) {
        results.push({ id: payment.id, success: false, error: `${payment.status} → ${status} は不可` });
        continue;
      }

      const updateData: Record<string, unknown> = { status };
      if (status === "PAID") {
        updateData.paidAt = new Date();
      }

      const updated = await prisma.payment.update({
        where: { id: payment.id },
        data: updateData,
      });

      await writeAuditLog({
        userId: user.id,
        action: "BATCH_UPDATE",
        entity: "Payment",
        entityId: payment.id,
        before: { status: payment.status },
        after: { status: updated.status },
        request,
      });

      await createDataVersion({
        entity: "Payment",
        entityId: payment.id,
        data: updated,
        changedBy: user.id,
        changeType: "UPDATE",
      });

      results.push({ id: payment.id, success: true });
    }

    // Mark missing IDs
    const foundIds = new Set(payments.map((p) => p.id));
    for (const id of paymentIds) {
      if (!foundIds.has(id)) {
        results.push({ id, success: false, error: "見つかりません" });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return NextResponse.json({
      data: results,
      summary: {
        total: paymentIds.length,
        success: successCount,
        failed: paymentIds.length - successCount,
      },
    });
  } catch (error) {
    console.error("Payment batch PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
