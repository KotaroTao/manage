import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getBusinessIdFilter } from "@/lib/access-control";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    // パートナーの場合、この事業にアクセス可能か確認
    if (allowedBizIds && !allowedBizIds.includes(id)) {
      return NextResponse.json({ error: "Forbidden: この事業へのアクセス権限がありません" }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || undefined;
    const sortBy = searchParams.get("sortBy") || "nextActionDate";
    const sortOrder = searchParams.get("sortOrder") === "desc" ? "desc" : "asc";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const perPage = Math.min(100, Math.max(1, parseInt(searchParams.get("perPage") || "20", 10)));
    const skip = (page - 1) * perPage;

    // Verify business exists
    const business = await prisma.business.findUnique({ where: { id } });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const where: Record<string, unknown> = {
      businessId: id,
      deletedAt: null,
    };

    if (search) {
      where.customer = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { company: { contains: search, mode: "insensitive" } },
        ],
        deletedAt: null,
      };
    } else {
      where.customer = { deletedAt: null };
    }

    if (status) {
      where.status = status;
    }

    const orderBy: Record<string, string> = {};
    if (sortBy === "nextActionDate") {
      orderBy.nextActionDate = sortOrder;
    } else if (sortBy === "createdAt") {
      orderBy.createdAt = sortOrder;
    } else {
      orderBy.nextActionDate = sortOrder;
    }

    const [customerBusinesses, total] = await Promise.all([
      prisma.customerBusiness.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, company: true, email: true, phone: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
        orderBy,
        skip,
        take: perPage,
      }),
      prisma.customerBusiness.count({ where }),
    ]);

    return NextResponse.json({
      data: customerBusinesses,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (error) {
    logger.error("Business customers GET error:", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
