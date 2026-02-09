import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import type { SessionUser } from "@/types";
import { ROLE_HIERARCHY } from "@/lib/security";

const SALT_ROUNDS = 12;

/**
 * Retrieve the currently authenticated user from the session.
 * Returns null if no valid session exists or user is deactivated.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  try {
    const session = await auth();
    if (!session?.user) {
      return null;
    }
    // isActiveチェック: 無効化されたユーザーを拒否
    if (session.user.isActive === false) {
      return null;
    }
    return session.user as SessionUser;
  } catch {
    return null;
  }
}

/**
 * Require an authenticated user. Throws an error if no session is found.
 * Use in server components and API routes to gate access.
 */
export async function requireAuth(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("認証が必要です");
  }
  if (!user.isActive) {
    throw new Error("アカウントが無効です");
  }
  return user;
}

/**
 * Require the current user to have at least the specified role level.
 * Throws an error if the user's role is insufficient.
 *
 * Role hierarchy: PARTNER < MEMBER < MANAGER < ADMIN
 */
export async function requireRole(requiredRole: Role): Promise<SessionUser> {
  const user = await requireAuth();
  const userLevel = ROLE_HIERARCHY[user.role] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;

  if (userLevel < requiredLevel) {
    throw new Error("権限が不足しています");
  }

  return user;
}

/**
 * Hash a plaintext password using bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Look up a full User record from the database by the current session user ID.
 * Useful when you need fields beyond what the JWT session stores.
 */
export async function getFullUser(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
