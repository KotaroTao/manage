import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;

    // 通知設定の取得
    if (searchParams.get("settings") === "true") {
      const setting = await prisma.notificationSetting.findUnique({
        where: { userId: user.id },
      });
      return NextResponse.json({
        data: setting || {
          alertDaysBefore: 3,
          emailNotification: false,
          showAllBusinesses: false,
        },
      });
    }

    const unreadOnly = searchParams.get("unreadOnly") === "true";

    const where: Record<string, unknown> = { userId: user.id };
    if (unreadOnly) {
      where.isRead = false;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: user.id, isRead: false },
    });

    return NextResponse.json({
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    console.error("Notifications GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { ids, markAllRead, updateSettings, alertDaysBefore, emailNotification, showAllBusinesses } = body;

    // 通知設定の更新
    if (updateSettings) {
      const setting = await prisma.notificationSetting.upsert({
        where: { userId: user.id },
        update: {
          ...(alertDaysBefore !== undefined && { alertDaysBefore: Number(alertDaysBefore) }),
          ...(emailNotification !== undefined && { emailNotification: Boolean(emailNotification) }),
          ...(showAllBusinesses !== undefined && { showAllBusinesses: Boolean(showAllBusinesses) }),
        },
        create: {
          userId: user.id,
          alertDaysBefore: Number(alertDaysBefore) || 3,
          emailNotification: Boolean(emailNotification),
          showAllBusinesses: Boolean(showAllBusinesses),
        },
      });
      return NextResponse.json({ data: setting });
    }

    const now = new Date();

    if (markAllRead) {
      await prisma.notification.updateMany({
        where: { userId: user.id, isRead: false },
        data: { isRead: true, readAt: now },
      });

      return NextResponse.json({ data: null, message: "All notifications marked as read" });
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      await prisma.notification.updateMany({
        where: {
          id: { in: ids },
          userId: user.id,
        },
        data: { isRead: true, readAt: now },
      });

      return NextResponse.json({ data: null, message: "Notifications marked as read", count: ids.length });
    }

    return NextResponse.json(
      { error: "Provide ids array or markAllRead: true" },
      { status: 400 },
    );
  } catch (error) {
    console.error("Notifications PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
