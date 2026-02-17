import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getPartnerAccess } from "@/lib/access-control";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Re-fetch from DB for freshest data
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // パートナーの場合はアクセス権限情報を付与
    let partnerAccess = null;
    if (user.role === "PARTNER") {
      partnerAccess = await getPartnerAccess(user);
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
      },
      partnerAccess,
    });
  } catch (error) {
    logger.error("Failed to get current user", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
