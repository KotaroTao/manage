import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden: Manager role required" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const period = searchParams.get("period");

    if (!period) {
      return NextResponse.json(
        { error: "period query parameter is required (e.g., 2026-02)" },
        { status: 400 },
      );
    }

    // Validate period format
    const periodMatch = period.match(/^\d{4}-\d{2}$/);
    if (!periodMatch) {
      return NextResponse.json(
        { error: "period must be in YYYY-MM format" },
        { status: 400 },
      );
    }

    const payments = await prisma.payment.findMany({
      where: {
        period,
        deletedAt: null,
      },
      include: {
        partner: { select: { id: true, name: true, company: true } },
      },
      orderBy: [{ partnerId: "asc" }, { createdAt: "asc" }],
    });

    // Group by partner
    const grouped: Record<
      string,
      {
        partnerId: string;
        partnerName: string;
        partnerCompany: string | null;
        payments: typeof payments;
        totals: {
          amount: number;
          tax: number;
          totalAmount: number;
          count: number;
          byStatus: Record<string, { count: number; totalAmount: number }>;
        };
      }
    > = {};

    for (const payment of payments) {
      const key = payment.partnerId;
      if (!grouped[key]) {
        grouped[key] = {
          partnerId: payment.partnerId,
          partnerName: payment.partner.name,
          partnerCompany: payment.partner.company,
          payments: [],
          totals: {
            amount: 0,
            tax: 0,
            totalAmount: 0,
            count: 0,
            byStatus: {},
          },
        };
      }

      grouped[key].payments.push(payment);
      grouped[key].totals.amount += payment.amount;
      grouped[key].totals.tax += payment.tax;
      grouped[key].totals.totalAmount += payment.totalAmount;
      grouped[key].totals.count += 1;

      if (!grouped[key].totals.byStatus[payment.status]) {
        grouped[key].totals.byStatus[payment.status] = {
          count: 0,
          totalAmount: 0,
        };
      }
      grouped[key].totals.byStatus[payment.status].count += 1;
      grouped[key].totals.byStatus[payment.status].totalAmount += payment.totalAmount;
    }

    const grandTotal = {
      amount: payments.reduce((sum, p) => sum + p.amount, 0),
      tax: payments.reduce((sum, p) => sum + p.tax, 0),
      totalAmount: payments.reduce((sum, p) => sum + p.totalAmount, 0),
      count: payments.length,
    };

    return NextResponse.json({
      data: Object.values(grouped),
      period,
      grandTotal,
    });
  } catch (error) {
    console.error("Monthly payments GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
