import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ALL_CONTENT_TYPES, type ContentType } from "@/lib/access-control";

/**
 * GET: パートナーアクセス設定一覧
 * パートナー(userId紐付きあり) × 事業のアクセス権一覧を返す
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "権限が不足しています" }, { status: 403 });
    }

    // userId が紐付いている（ログイン可能な）パートナーを取得
    const partners = await prisma.partner.findMany({
      where: { deletedAt: null, userId: { not: null } },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        userId: true,
        status: true,
        partnerBusinesses: {
          select: {
            id: true,
            businessId: true,
            isActive: true,
            permissions: true,
            canEdit: true,
            business: {
              select: { id: true, name: true, code: true, colorCode: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ data: partners });
  } catch (error) {
    console.error("Partner access GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST: パートナーに事業アクセスを追加
 * body: { partnerId, businessId, permissions: string[], canEdit: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "権限が不足しています" }, { status: 403 });
    }

    const body = await request.json();
    const { partnerId, businessId, permissions, canEdit } = body;

    if (!partnerId || !businessId) {
      return NextResponse.json({ error: "partnerId, businessId は必須です" }, { status: 400 });
    }

    // パートナー存在確認
    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null, userId: { not: null } },
    });
    if (!partner) {
      return NextResponse.json({ error: "パートナーが見つかりません" }, { status: 404 });
    }

    // 事業存在確認
    const business = await prisma.business.findUnique({
      where: { id: businessId },
    });
    if (!business) {
      return NextResponse.json({ error: "事業が見つかりません" }, { status: 404 });
    }

    // permissions のバリデーション
    const validPerms = (permissions || []).filter(
      (p: string) => ALL_CONTENT_TYPES.includes(p as ContentType),
    );

    const result = await prisma.partnerBusiness.upsert({
      where: {
        partnerId_businessId: { partnerId, businessId },
      },
      create: {
        partnerId,
        businessId,
        permissions: validPerms,
        canEdit: canEdit ?? false,
        isActive: true,
      },
      update: {
        permissions: validPerms,
        canEdit: canEdit ?? false,
        isActive: true,
      },
      include: {
        business: {
          select: { id: true, name: true, code: true, colorCode: true },
        },
      },
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("Partner access POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
