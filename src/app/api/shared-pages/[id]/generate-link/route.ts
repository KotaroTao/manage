import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: pageId } = await context.params;

    const page = await prisma.sharedPage.findUnique({
      where: { id: pageId },
      select: { id: true, customerBusinessId: true },
    });

    if (!page) {
      return NextResponse.json(
        { error: "ページが見つかりません" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { scope, passcode, expiresInDays } = body;

    // Map frontend scope values to Prisma enum
    const mappedScope = scope === "SINGLE" ? "SINGLE_PAGE" : scope === "PORTAL" ? "PORTAL" : "SINGLE_PAGE";

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (Number(expiresInDays) || 30));

    // Publish the page if not already published
    await prisma.sharedPage.update({
      where: { id: pageId },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    const shareLink = await prisma.shareLink.create({
      data: {
        sharedPageId: mappedScope === "SINGLE_PAGE" ? pageId : null,
        customerBusinessId: page.customerBusinessId,
        scope: mappedScope as never,
        passcode: passcode || null,
        expiresAt,
        isActive: true,
        createdById: user.id,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "";
    const url = `${baseUrl}/shared/${shareLink.token}`;

    return NextResponse.json({ data: { url, token: shareLink.token } }, { status: 201 });
  } catch (error) {
    console.error("Generate link error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
