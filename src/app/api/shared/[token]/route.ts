import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        sharedPage: true,
        customerBusiness: {
          include: {
            customer: { select: { id: true, name: true, company: true } },
            business: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!shareLink) {
      return NextResponse.json({ error: "Invalid share link" }, { status: 404 });
    }

    if (!shareLink.isActive) {
      return NextResponse.json({ error: "Share link is no longer active" }, { status: 403 });
    }

    // Check expiry
    if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 403 });
    }

    // Check passcode if set
    if (shareLink.passcode) {
      const providedPasscode = request.headers.get("X-Passcode");
      if (!providedPasscode || providedPasscode !== shareLink.passcode) {
        return NextResponse.json(
          { error: "Invalid passcode", requiresPasscode: true },
          { status: 401 },
        );
      }
    }

    let data: unknown;

    if (shareLink.scope === "PORTAL") {
      // Return all published SharedPages for the customerBusiness
      const pages = await prisma.sharedPage.findMany({
        where: {
          customerBusinessId: shareLink.customerBusinessId,
          isPublished: true,
        },
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          attachments: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      data = {
        scope: "PORTAL",
        customerName: shareLink.customerBusiness.customer.name,
        businessName: shareLink.customerBusiness.business.name,
        pages,
      };
    } else {
      // SINGLE_PAGE scope
      if (!shareLink.sharedPage) {
        return NextResponse.json(
          { error: "Shared page not found" },
          { status: 404 },
        );
      }

      data = {
        scope: "SINGLE_PAGE",
        customerName: shareLink.customerBusiness.customer.name,
        businessName: shareLink.customerBusiness.business.name,
        page: {
          id: shareLink.sharedPage.id,
          type: shareLink.sharedPage.type,
          title: shareLink.sharedPage.title,
          content: shareLink.sharedPage.content,
          attachments: shareLink.sharedPage.attachments,
          publishedAt: shareLink.sharedPage.publishedAt,
          createdAt: shareLink.sharedPage.createdAt,
          updatedAt: shareLink.sharedPage.updatedAt,
        },
      };
    }

    // Log access
    await prisma.shareAccessLog.create({
      data: {
        shareLinkId: shareLink.id,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null,
        userAgent: request.headers.get("user-agent") || null,
      },
    });

    // Update access count and lastAccessedAt
    await prisma.shareLink.update({
      where: { id: shareLink.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("Shared page GET error:", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
