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
    const { amount, note } = await request.json();

    const budget = await prisma.budget.update({
      where: { id },
      data: {
        ...(amount !== undefined && { amount: parseInt(String(amount), 10) }),
        ...(note !== undefined && { note }),
      },
      include: {
        category: { select: { id: true, name: true } },
        business: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data: budget });
  } catch (error) {
    console.error("Budget PUT error:", error);
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
    await prisma.budget.delete({ where: { id } });
    return NextResponse.json({ data: null, message: "削除しました" });
  } catch (error) {
    console.error("Budget DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
