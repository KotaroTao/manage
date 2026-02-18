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

    // 大分類を取得(子カテゴリ付き)
    const categories = await prisma.expenseCategory.findMany({
      where: { parentId: null, isActive: true },
      include: {
        children: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: categories });
  } catch (error) {
    logger.error("ExpenseCategories GET error:", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { name, parentId, description, sortOrder, budgetTarget } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    // 重複チェック
    const existing = await prisma.expenseCategory.findFirst({
      where: { name: name.trim(), parentId: parentId || null, isActive: true },
    });
    if (existing) {
      return NextResponse.json({ error: "同名のカテゴリが既に存在します" }, { status: 409 });
    }

    const category = await prisma.expenseCategory.create({
      data: {
        name: name.trim(),
        parentId: parentId || null,
        description: description || null,
        sortOrder: sortOrder ?? 0,
        budgetTarget: budgetTarget ?? true,
      },
    });

    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    logger.error("ExpenseCategories POST error:", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
