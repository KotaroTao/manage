import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { writeAuditLog, createDataVersion } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const isActive = searchParams.get("isActive");

    const where: Record<string, unknown> = {};
    if (isActive !== null) {
      where.isActive = isActive === "true";
    }

    const businesses = await prisma.business.findMany({
      where,
      include: {
        manager: { select: { id: true, name: true, email: true } },
        _count: {
          select: {
            customerBusinesses: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    // Get active workflow counts per business
    const businessesWithStats = await Promise.all(
      businesses.map(async (biz) => {
        const activeWorkflowCount = await prisma.workflow.count({
          where: {
            customerBusiness: { businessId: biz.id, deletedAt: null },
            status: "ACTIVE",
          },
        });

        return {
          ...biz,
          stats: {
            customerCount: biz._count.customerBusinesses,
            activeWorkflowCount,
          },
        };
      }),
    );

    return NextResponse.json({ data: businessesWithStats });
  } catch (error) {
    console.error("Businesses GET error:", error);
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

    if (user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden: Admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, description, managerId, colorCode, sortOrder } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    if (!code || typeof code !== "string" || code.trim() === "") {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    // Check code uniqueness
    const existingCode = await prisma.business.findUnique({
      where: { code: code.trim() },
    });

    if (existingCode) {
      return NextResponse.json(
        { error: "Business code already exists" },
        { status: 400 },
      );
    }

    const business = await prisma.business.create({
      data: {
        name: name.trim(),
        code: code.trim(),
        description: description || null,
        managerId: managerId || null,
        colorCode: colorCode || "#3B82F6",
        sortOrder: sortOrder ?? 0,
      },
    });

    await writeAuditLog({
      userId: user.id,
      action: "CREATE",
      entity: "Business",
      entityId: business.id,
      after: business,
      request,
    });

    await createDataVersion({
      entity: "Business",
      entityId: business.id,
      data: business,
      changedBy: user.id,
      changeType: "CREATE",
    });

    return NextResponse.json({ data: business }, { status: 201 });
  } catch (error) {
    console.error("Business POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
