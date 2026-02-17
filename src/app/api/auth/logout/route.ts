import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    logger.error("Logout failed", error, request);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
