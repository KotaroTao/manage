import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getPartnerAccess } from "@/lib/access-control";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const access = await getPartnerAccess(user);

    // Verify payment exists and is accessible
    const payment = await prisma.payment.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(access && { partnerId: access.partnerId }),
      },
      select: { id: true },
    });

    if (!payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // Get audit logs for this payment
    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entity: "Payment",
        entityId: id,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Enrich with user names
    const userIds = [...new Set(auditLogs.map((log) => log.userId).filter(Boolean))] as string[];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    const history = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      userName: log.userId ? userMap.get(log.userId) ?? "不明" : "システム",
      before: log.before,
      after: log.after,
      createdAt: log.createdAt,
    }));

    return NextResponse.json({ data: history });
  } catch (error) {
    logger.error("PaymentHistory GET error:", error, request);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
