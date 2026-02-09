import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Paths that do not require authentication.
 */
const publicPaths = [
  "/login",
  "/shared",
  "/api/auth",
  "/api/shared",
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths through without authentication
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  // Check for a valid session token (secret matches auth.ts)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  });

  // Redirect unauthenticated users to the login page
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 無効化されたユーザーをログイン画面にリダイレクト
  if (token.isActive === false) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "inactive");
    return NextResponse.redirect(loginUrl);
  }

  // セキュリティヘッダーの追加
  const response = NextResponse.next();
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
