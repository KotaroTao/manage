import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    // Validate share link
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
    });

    if (!shareLink || !shareLink.isActive) {
      return NextResponse.json({ error: "Invalid share link" }, { status: 404 });
    }

    if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 403 });
    }

    // Validate passcode if required
    if (shareLink.passcode) {
      const providedPasscode = request.headers.get("x-passcode");
      if (!providedPasscode || providedPasscode !== shareLink.passcode) {
        return NextResponse.json({ error: "Invalid or missing passcode" }, { status: 401 });
      }
    }

    if (!shareLink.sharedPageId) {
      return NextResponse.json({ error: "No page associated with this link" }, { status: 404 });
    }

    const comments = await prisma.sharedPageComment.findMany({
      where: { sharedPageId: shareLink.sharedPageId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ data: comments });
  } catch (error) {
    console.error("Shared comments GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { token } = await context.params;

    // Validate share link
    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
    });

    if (!shareLink || !shareLink.isActive) {
      return NextResponse.json({ error: "Invalid share link" }, { status: 404 });
    }

    if (shareLink.expiresAt && new Date() > shareLink.expiresAt) {
      return NextResponse.json({ error: "Share link has expired" }, { status: 403 });
    }

    // Validate passcode if required
    if (shareLink.passcode) {
      const providedPasscode = request.headers.get("x-passcode");
      if (!providedPasscode || providedPasscode !== shareLink.passcode) {
        return NextResponse.json({ error: "Invalid or missing passcode" }, { status: 401 });
      }
    }

    if (!shareLink.sharedPageId) {
      return NextResponse.json(
        { error: "No page associated with this link" },
        { status: 404 },
      );
    }

    const body = await request.json();
    const { authorName, content } = body;

    if (!authorName || typeof authorName !== "string" || authorName.trim() === "") {
      return NextResponse.json(
        { error: "authorName is required" },
        { status: 400 },
      );
    }

    if (!content || typeof content !== "string" || content.trim() === "") {
      return NextResponse.json(
        { error: "content is required" },
        { status: 400 },
      );
    }

    // Simple rate limiting by IP-based key (count all recent comments on this page
    // rather than filtering by authorName which is easily spoofed)
    const clientIp =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentComments = await prisma.sharedPageComment.count({
      where: {
        sharedPageId: shareLink.sharedPageId,
        createdAt: { gte: oneMinuteAgo },
      },
    });

    if (recentComments >= 5) {
      return NextResponse.json(
        { error: "Too many comments. Please wait before posting again." },
        { status: 429 },
      );
    }

    const comment = await prisma.sharedPageComment.create({
      data: {
        sharedPageId: shareLink.sharedPageId,
        authorName: authorName.trim(),
        content: content.trim(),
      },
    });

    return NextResponse.json({ data: comment }, { status: 201 });
  } catch (error) {
    console.error("Shared comment POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
