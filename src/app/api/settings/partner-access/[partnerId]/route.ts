import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { ALL_CONTENT_TYPES, type ContentType } from "@/lib/access-control";

type RouteContext = { params: Promise<{ partnerId: string }> };

/**
 * GET: 特定パートナーのアクセス設定詳細
 */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "権限が不足しています" }, { status: 403 });
    }

    const { partnerId } = await context.params;

    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null },
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
              select: { id: true, name: true, code: true, colorCode: true, isActive: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "パートナーが見つかりません" }, { status: 404 });
    }

    return NextResponse.json({ data: partner });
  } catch (error) {
    console.error("Partner access detail GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * PUT: パートナーのアクセス設定を一括更新
 * body: { accesses: [{ businessId, permissions: string[], canEdit: boolean, isActive: boolean }] }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (user.role !== "ADMIN" && user.role !== "MANAGER") {
      return NextResponse.json({ error: "権限が不足しています" }, { status: 403 });
    }

    const { partnerId } = await context.params;
    const body = await request.json();
    const { accesses } = body;

    if (!Array.isArray(accesses)) {
      return NextResponse.json({ error: "accesses は配列で指定してください" }, { status: 400 });
    }

    const partner = await prisma.partner.findFirst({
      where: { id: partnerId, deletedAt: null },
    });
    if (!partner) {
      return NextResponse.json({ error: "パートナーが見つかりません" }, { status: 404 });
    }

    // 既存のアクセス権を取得
    const existingAccesses = await prisma.partnerBusiness.findMany({
      where: { partnerId },
    });
    const existingMap = new Map(existingAccesses.map((a) => [a.businessId, a]));

    // 送信されたビジネスIDセット
    const sentBusinessIds = new Set(
      accesses.map((a: { businessId: string }) => a.businessId),
    );

    // トランザクションで一括更新
    await prisma.$transaction(async (tx) => {
      // 送信されなかった既存アクセスを無効化
      for (const existing of existingAccesses) {
        if (!sentBusinessIds.has(existing.businessId)) {
          await tx.partnerBusiness.update({
            where: { id: existing.id },
            data: { isActive: false },
          });
        }
      }

      // 送信されたアクセスをupsert
      for (const access of accesses as {
        businessId: string;
        permissions: string[];
        canEdit: boolean;
        isActive?: boolean;
      }[]) {
        const validPerms = (access.permissions || []).filter(
          (p: string) => ALL_CONTENT_TYPES.includes(p as ContentType),
        );

        if (existingMap.has(access.businessId)) {
          await tx.partnerBusiness.update({
            where: {
              partnerId_businessId: {
                partnerId,
                businessId: access.businessId,
              },
            },
            data: {
              permissions: validPerms,
              canEdit: access.canEdit ?? false,
              isActive: access.isActive !== false,
            },
          });
        } else {
          await tx.partnerBusiness.create({
            data: {
              partnerId,
              businessId: access.businessId,
              permissions: validPerms,
              canEdit: access.canEdit ?? false,
              isActive: access.isActive !== false,
            },
          });
        }
      }
    });

    // 更新後のデータを返す
    const updated = await prisma.partner.findFirst({
      where: { id: partnerId },
      select: {
        id: true,
        name: true,
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
        },
      },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("Partner access PUT error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
