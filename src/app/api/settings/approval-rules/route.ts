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

    const rules = await prisma.approvalRule.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    return NextResponse.json({ data: rules });
  } catch (error) {
    logger.error("ApprovalRules GET error:", error, request);
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

    const { name, minAmount, maxAmount, requiredRole, autoApprove, sortOrder } = await request.json();
    if (!name || minAmount === undefined || !requiredRole) {
      return NextResponse.json({ error: "name, minAmount, requiredRole は必須です" }, { status: 400 });
    }

    const rule = await prisma.approvalRule.create({
      data: {
        name: name.trim(),
        minAmount: parseInt(String(minAmount), 10),
        maxAmount: maxAmount != null ? parseInt(String(maxAmount), 10) : null,
        requiredRole,
        autoApprove: autoApprove ?? false,
        sortOrder: sortOrder ?? 0,
      },
    });

    return NextResponse.json({ data: rule }, { status: 201 });
  } catch (error) {
    logger.error("ApprovalRule POST error:", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
