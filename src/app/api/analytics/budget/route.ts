import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { logger } from "@/lib/logger";

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
    const period = searchParams.get("period"); // "2026-01" or "2026" (yearly)
    const businessId = searchParams.get("businessId") || undefined;

    if (!period) {
      return NextResponse.json({ error: "period is required" }, { status: 400 });
    }

    // period が年だけ ("2026") の場合は年間、月付き ("2026-01") の場合は月次
    const isYearly = period.length === 4;
    const periodFilter = isYearly
      ? { startsWith: period }
      : period;

    // 大分類を取得
    const majorCategories = await prisma.expenseCategory.findMany({
      where: { parentId: null, isActive: true },
      include: { children: { where: { isActive: true }, select: { id: true } } },
      orderBy: { sortOrder: "asc" },
    });

    // 予算データ
    const budgetWhere: Record<string, unknown> = {};
    if (isYearly) {
      budgetWhere.period = { startsWith: period };
    } else {
      budgetWhere.period = period;
    }
    if (businessId) budgetWhere.businessId = businessId;

    const budgets = await prisma.budget.findMany({ where: budgetWhere });

    // 実績データ: カテゴリIDから実績を集計
    const allCategoryIds = majorCategories.flatMap((mc) => [mc.id, ...mc.children.map((c) => c.id)]);

    const paymentWhere: Record<string, unknown> = {
      deletedAt: null,
      status: { in: ["APPROVED", "PAID"] },
      categoryId: { in: allCategoryIds },
    };
    if (isYearly) {
      paymentWhere.period = { startsWith: period };
    } else {
      paymentWhere.period = periodFilter;
    }
    if (businessId) paymentWhere.businessId = businessId;

    const payments = await prisma.payment.findMany({
      where: paymentWhere,
      select: { categoryId: true, totalAmount: true },
    });

    // カテゴリIDごとの実績合計
    const actualByCategory: Record<string, number> = {};
    for (const p of payments) {
      if (p.categoryId) {
        actualByCategory[p.categoryId] = (actualByCategory[p.categoryId] || 0) + p.totalAmount;
      }
    }

    // 大分類ごとに集計
    const result = majorCategories.map((mc) => {
      const childIds = mc.children.map((c) => c.id);
      const allIds = [mc.id, ...childIds];

      // 予算合計
      const budgetAmount = budgets
        .filter((b) => b.categoryId === mc.id)
        .reduce((s, b) => s + b.amount, 0);

      // 実績合計(大分類直接 + 子カテゴリ)
      const actualAmount = allIds.reduce((s, cid) => s + (actualByCategory[cid] || 0), 0);

      const rate = budgetAmount > 0 ? Math.round((actualAmount / budgetAmount) * 100) : 0;

      return {
        categoryId: mc.id,
        categoryName: mc.name,
        budget: budgetAmount,
        actual: actualAmount,
        remaining: budgetAmount - actualAmount,
        rate,
      };
    });

    const totalBudget = result.reduce((s, r) => s + r.budget, 0);
    const totalActual = result.reduce((s, r) => s + r.actual, 0);

    return NextResponse.json({
      data: result,
      summary: {
        totalBudget,
        totalActual,
        totalRemaining: totalBudget - totalActual,
        totalRate: totalBudget > 0 ? Math.round((totalActual / totalBudget) * 100) : 0,
      },
    });
  } catch (error) {
    logger.error("Analytics Budget GET error:", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
