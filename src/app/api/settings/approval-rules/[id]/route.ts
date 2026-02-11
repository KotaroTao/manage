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
    const { name, minAmount, maxAmount, requiredRole, autoApprove, sortOrder, isActive } = await request.json();

    const rule = await prisma.approvalRule.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(minAmount !== undefined && { minAmount: parseInt(String(minAmount), 10) }),
        ...(maxAmount !== undefined && { maxAmount: maxAmount != null ? parseInt(String(maxAmount), 10) : null }),
        ...(requiredRole !== undefined && { requiredRole }),
        ...(autoApprove !== undefined && { autoApprove }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    return NextResponse.json({ data: rule });
  } catch (error) {
    console.error("ApprovalRule PUT error:", error);
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
    await prisma.approvalRule.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ data: null, message: "無効化しました" });
  } catch (error) {
    console.error("ApprovalRule DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
