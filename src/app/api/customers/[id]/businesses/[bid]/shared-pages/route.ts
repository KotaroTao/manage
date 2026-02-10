import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getBusinessIdFilter, canWrite } from "@/lib/access-control";

type RouteContext = { params: Promise<{ id: string; bid: string }> };

const TYPE_MAP: Record<string, string> = {
  REPORT: "REPORT",
  PROPOSAL: "DOCUMENT",
  PORTAL: "CUSTOM",
  OTHER: "CUSTOM",
  MEETING_NOTE: "MEETING_NOTE",
  PROGRESS: "PROGRESS",
  DOCUMENT: "DOCUMENT",
  CUSTOM: "CUSTOM",
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { bid } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    // パートナーの場合、customerBusinessのbusinessIdがアクセス可能か確認
    if (allowedBizIds) {
      const cb = await prisma.customerBusiness.findFirst({
        where: { id: bid, deletedAt: null, businessId: { in: allowedBizIds } },
        select: { id: true },
      });
      if (!cb) {
        return NextResponse.json({ data: [] });
      }
    }

    const pages = await prisma.sharedPage.findMany({
      where: { customerBusinessId: bid },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: pages });
  } catch (error) {
    console.error("SharedPages GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id, bid } = await context.params;
    const allowedBizIds = await getBusinessIdFilter(user, "customers");

    // パートナーの書き込み権限チェック
    if (allowedBizIds && !(await canWrite(user))) {
      return NextResponse.json({ error: "Forbidden: 編集権限がありません" }, { status: 403 });
    }

    // Verify customerBusiness exists (and is accessible to partner)
    const cb = await prisma.customerBusiness.findFirst({
      where: {
        id: bid,
        customerId: id,
        deletedAt: null,
        ...(allowedBizIds && { businessId: { in: allowedBizIds } }),
      },
    });
    if (!cb) {
      return NextResponse.json(
        { error: "顧客事業が見つかりません" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { type, title, content, isPublished } = body;

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "タイトルは必須です" },
        { status: 400 },
      );
    }

    const mappedType = TYPE_MAP[type] || "CUSTOM";

    const page = await prisma.sharedPage.create({
      data: {
        customerBusinessId: bid,
        type: mappedType as never,
        title: title.trim(),
        content: content || "",
        isPublished: isPublished ?? false,
        publishedAt: isPublished ? new Date() : null,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ data: page }, { status: 201 });
  } catch (error) {
    console.error("SharedPages POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
