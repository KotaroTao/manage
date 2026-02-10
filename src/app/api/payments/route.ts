import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";
import { getPartnerAccess } from "@/lib/access-control";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const partnerId = searchParams.get("partnerId") || undefined;
    const status = searchParams.get("status") || undefined;
    const period = searchParams.get("period") || undefined;
    const type = searchParams.get("type") || undefined;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * perPage;

    const where: Record<string, unknown> = { deletedAt: null };
    if (partnerId) where.partnerId = partnerId;
    if (status) where.status = status;
    if (period) where.period = period;
    if (type) where.type = type;

    // パートナーの場合: 自分のパートナーIDに紐づく支払いのみ
    const access = await getPartnerAccess(user);
    if (access) {
      where.partnerId = access.partnerId;
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          partner: { select: { id: true, name: true, company: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage,
      }),
      prisma.payment.count({ where }),
    ]);

    // Summary aggregation (パートナーの場合は自分の支払いのみ集計)
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const summaryBase: Record<string, unknown> = { deletedAt: null };
    if (access) summaryBase.partnerId = access.partnerId;

    const [paidThisMonth, statusCounts] = await Promise.all([
      prisma.payment.aggregate({
        where: { ...summaryBase, period: thisMonth, status: "PAID" },
        _sum: { totalAmount: true },
      }),
      prisma.payment.groupBy({
        by: ["status"],
        where: summaryBase,
        _count: true,
      }),
    ]);

    const countByStatus: Record<string, number> = {};
    for (const row of statusCounts) {
      countByStatus[row.status] = row._count;
    }

    return NextResponse.json({
      data: payments,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
      summary: {
        totalThisMonth: paidThisMonth._sum.totalAmount ?? 0,
        pendingCount: countByStatus["PENDING"] ?? 0,
        paidCount: countByStatus["PAID"] ?? 0,
        draftCount: countByStatus["DRAFT"] ?? 0,
      },
    });
  } catch (error) {
    console.error("Payments GET error:", error);
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

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden: Manager role required" }, { status: 403 });
    }

    const body = await request.json();
    const {
      partnerId,
      workflowId,
      customerBusinessId,
      businessId,
      amount,
      tax,
      withholdingTax,
      type,
      period,
      dueDate,
      note,
    } = body;

    if (!partnerId) {
      return NextResponse.json({ error: "partnerId is required" }, { status: 400 });
    }
    if (amount === undefined || amount === null) {
      return NextResponse.json({ error: "amount is required" }, { status: 400 });
    }
    if (!type) {
      return NextResponse.json({ error: "type is required" }, { status: 400 });
    }

    const parsedAmount = parseInt(String(amount), 10);
    if (isNaN(parsedAmount)) {
      return NextResponse.json({ error: "amount must be a valid integer" }, { status: 400 });
    }
    const parsedTax = parseInt(String(tax ?? 0), 10);
    if (isNaN(parsedTax)) {
      return NextResponse.json({ error: "tax must be a valid integer" }, { status: 400 });
    }

    // Verify partner exists
    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null },
    });

    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const taxAmount = parsedTax;
    const totalAmount = parsedAmount + taxAmount;
    const parsedWithholdingTax = parseInt(String(withholdingTax ?? 0), 10) || 0;
    const netAmount = totalAmount - parsedWithholdingTax;

    const payment = await prisma.payment.create({
      data: {
        partnerId,
        workflowId: workflowId || null,
        customerBusinessId: customerBusinessId || null,
        businessId: businessId || null,
        amount: parsedAmount,
        tax: taxAmount,
        totalAmount,
        withholdingTax: parsedWithholdingTax,
        netAmount,
        type,
        status: "DRAFT",
        period: period || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        note: note || null,
      },
      include: {
        partner: { select: { id: true, name: true } },
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Payment",
      entityId: payment.id,
      after: payment,
      request,
    });

    await createDataVersion({
      entity: "Payment",
      entityId: payment.id,
      data: payment,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: payment }, { status: 201 });
  } catch (error) {
    console.error("Payment POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
