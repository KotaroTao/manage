import type { Role } from "@prisma/client";

// ============================================================
// Role-Based Access Control (RBAC)
// ============================================================

/**
 * Numeric hierarchy for roles.
 * Higher value = higher privilege.
 */
export const ROLE_HIERARCHY: Record<Role, number> = {
  PARTNER: 0,
  MEMBER: 1,
  MANAGER: 2,
  ADMIN: 3,
} as const;

/**
 * Check whether a user's role meets or exceeds the required role level.
 *
 * @param userRole - The role of the current user
 * @param requiredRole - The minimum role required for access
 * @returns true if the user has sufficient privilege
 */
export function canAccess(userRole: Role, requiredRole: Role): boolean {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? 999;
  return userLevel >= requiredLevel;
}

/**
 * Get all roles that a given role can manage (i.e., roles at the same level or below).
 */
export function getManageableRoles(userRole: Role): Role[] {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  return (Object.entries(ROLE_HIERARCHY) as [Role, number][])
    .filter(([, level]) => level <= userLevel)
    .map(([role]) => role);
}

// ============================================================
// Rate Limiting (In-Memory, Map-Based)
// ============================================================

interface RateLimitEntry {
  count: number;
  resetAt: number; // Unix timestamp in ms
}

/**
 * In-memory store for rate-limit tracking.
 * Key: identifier string (e.g., IP address, user ID, or endpoint key).
 *
 * NOTE: This is per-process. In a multi-instance deployment, use Redis
 * or a similar shared store instead.
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Periodically clean up expired entries to prevent memory leaks.
 * Runs every 60 seconds.
 */
const CLEANUP_INTERVAL_MS = 60_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer(): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetAt <= now) {
        rateLimitStore.delete(key);
      }
    }
    // If the store is empty, stop the timer to avoid keeping the process alive
    if (rateLimitStore.size === 0 && cleanupTimer !== null) {
      clearInterval(cleanupTimer);
      cleanupTimer = null;
    }
  }, CLEANUP_INTERVAL_MS);

  // Allow the Node.js process to exit even if the timer is running
  if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count within the window */
  current: number;
  /** Maximum requests allowed within the window */
  limit: number;
  /** Remaining requests before hitting the limit */
  remaining: number;
  /** Unix timestamp (ms) when the window resets */
  resetAt: number;
}

/**
 * Check and increment the rate limit counter for a given identifier.
 *
 * @param identifier - Unique key for the rate limit bucket (e.g., IP, userId, "login:ip")
 * @param limit - Maximum number of requests allowed within the time window
 * @param windowMs - Time window in milliseconds (default: 60000 = 1 minute)
 * @returns RateLimitResult indicating whether the request is allowed
 *
 * @example
 * ```ts
 * const result = checkRateLimit(`login:${ip}`, 5, 15 * 60 * 1000);
 * if (!result.allowed) {
 *   return Response.json({ error: "Too many attempts" }, { status: 429 });
 * }
 * ```
 */
export function checkRateLimit(
  identifier: string,
  limit: number,
  windowMs: number = 60_000,
): RateLimitResult {
  ensureCleanupTimer();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // If no entry or the window has expired, create a fresh entry
  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    rateLimitStore.set(identifier, { count: 1, resetAt });
    return {
      allowed: true,
      current: 1,
      limit,
      remaining: limit - 1,
      resetAt,
    };
  }

  // Increment the counter
  entry.count += 1;

  const allowed = entry.count <= limit;
  const remaining = Math.max(0, limit - entry.count);

  return {
    allowed,
    current: entry.count,
    limit,
    remaining,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset the rate limit for a specific identifier.
 * Useful after a successful authentication to clear failed-attempt counters.
 */
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

/**
 * Convenience: build a rate-limit response header object for HTTP responses.
 */
export function rateLimitHeaders(
  result: RateLimitResult,
): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}
