import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const { name, description, sortOrder, budgetTarget, isActive } = await request.json();

    const existing = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Category not found" }, { status: 404 });
    }

    const updated = await prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(budgetTarget !== undefined && { budgetTarget }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("ExpenseCategory PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;

    // 使用中チェック
    const usedCount = await prisma.payment.count({ where: { categoryId: id, deletedAt: null } });
    if (usedCount > 0) {
      return NextResponse.json({ error: `${usedCount}件の支払いで使用中のため削除できません。無効化してください。` }, { status: 409 });
    }

    // 子カテゴリがある場合は子も無効化
    await prisma.expenseCategory.updateMany({
      where: { parentId: id },
      data: { isActive: false },
    });

    await prisma.expenseCategory.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ data: null, message: "無効化しました" });
  } catch (error) {
    console.error("ExpenseCategory DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
