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
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const period = searchParams.get("period") || undefined;
    const businessId = searchParams.get("businessId") || undefined;

    const where: Record<string, unknown> = {};
    if (period) where.period = period;
    if (businessId) where.businessId = businessId;

    const budgets = await prisma.budget.findMany({
      where,
      include: {
        category: { select: { id: true, name: true, parentId: true } },
        business: { select: { id: true, name: true } },
      },
      orderBy: [{ period: "desc" }, { category: { sortOrder: "asc" } }],
    });

    return NextResponse.json({ data: budgets });
  } catch (error) {
    console.error("Budgets GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { categoryId, businessId, period, amount, note } = await request.json();
    if (!categoryId || !period || amount === undefined) {
      return NextResponse.json({ error: "categoryId, period, amount は必須です" }, { status: 400 });
    }

    // カテゴリが大分類であることを確認
    const category = await prisma.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.parentId !== null) {
      return NextResponse.json({ error: "予算は大分類に対してのみ設定可能です" }, { status: 400 });
    }

    // 重複チェック
    const existing = await prisma.budget.findFirst({
      where: { categoryId, businessId: businessId || null, period },
    });
    if (existing) {
      return NextResponse.json({ error: "同じカテゴリ・事業・期間の予算が既に存在します" }, { status: 409 });
    }

    const budget = await prisma.budget.create({
      data: {
        categoryId,
        businessId: businessId || null,
        period,
        amount: parseInt(String(amount), 10),
        note: note || null,
      },
      include: {
        category: { select: { id: true, name: true } },
        business: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data: budget }, { status: 201 });
  } catch (error) {
    console.error("Budget POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
