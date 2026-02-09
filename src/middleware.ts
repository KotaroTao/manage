import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
);

const COOKIE_NAME = "auth_token";

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

  // Check for auth_token cookie
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);

    // Check if user is active
    if (payload.isActive === false) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("error", "inactive");
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    // Invalid token - redirect to login
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    // Clear invalid cookie
    response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
    return response;
  }

  // Add security headers
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
