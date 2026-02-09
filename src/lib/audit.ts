import prisma from "@/lib/prisma";
import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import type { AuditLogParams, DataVersionParams } from "@/types";

/**
 * Extract the client IP address from a NextRequest or from Next.js headers().
 * Checks x-forwarded-for first (common behind proxies/load balancers),
 * then falls back to x-real-ip.
 */
function getIpFromHeaders(
  headerSource: { get(name: string): string | null },
): string | null {
  const forwarded = headerSource.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return headerSource.get("x-real-ip") ?? null;
}

/**
 * Extract the client IP from the current request context.
 * Accepts an optional NextRequest; falls back to next/headers.
 */
async function resolveIp(
  request?: NextRequest,
): Promise<string | null> {
  if (request) {
    return getIpFromHeaders(request.headers);
  }
  try {
    const headersList = await headers();
    return getIpFromHeaders(headersList);
  } catch {
    return null;
  }
}

/**
 * Extract the User-Agent from the current request context.
 * Accepts an optional NextRequest; falls back to next/headers.
 */
async function resolveUserAgent(
  request?: NextRequest,
): Promise<string | null> {
  if (request) {
    return request.headers.get("user-agent") ?? null;
  }
  try {
    const headersList = await headers();
    return headersList.get("user-agent") ?? null;
  } catch {
    return null;
  }
}

/**
 * Write an immutable audit log entry to the AuditLog table.
 *
 * Records who did what, to which entity, with optional before/after snapshots
 * and client metadata (IP, User-Agent).
 *
 * The `request` field (NextRequest) can be passed to extract IP and User-Agent
 * automatically. If omitted, the function falls back to `next/headers`.
 * Explicit `ipAddress` / `userAgent` fields take priority over auto-detection.
 */
export async function writeAuditLog(
  params: AuditLogParams,
): Promise<void> {
  try {
    const ipAddress =
      params.ipAddress !== undefined
        ? params.ipAddress
        : await resolveIp(params.request);
    const userAgent =
      params.userAgent !== undefined
        ? params.userAgent
        : await resolveUserAgent(params.request);

    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
        ipAddress,
        userAgent,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation.
    // Log the failure for operational monitoring.
    console.error("[AuditLog] Failed to write audit log:", error);
  }
}

/**
 * Create a data version snapshot in the DataVersion table.
 *
 * Automatically determines the next version number for the given entity+entityId
 * combination by querying the current maximum version.
 */
export async function createDataVersion(
  params: DataVersionParams,
): Promise<void> {
  try {
    // Determine the next version number
    const latestVersion = await prisma.dataVersion.findFirst({
      where: {
        entity: params.entity,
        entityId: params.entityId,
      },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const nextVersion = (latestVersion?.version ?? 0) + 1;

    await prisma.dataVersion.create({
      data: {
        entity: params.entity,
        entityId: params.entityId,
        version: nextVersion,
        data: params.data,
        changedBy: params.changedBy ?? null,
        changeType: params.changeType,
      },
    });
  } catch (error) {
    // Data versioning should never break the main operation.
    console.error("[DataVersion] Failed to create data version:", error);
  }
}

/**
 * Convenience function to write both an audit log and a data version
 * in a single call. Useful for create/update/delete operations on
 * important entities.
 */
export async function auditAndVersion(params: {
  userId?: string;
  action: string;
  entity: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  data: Record<string, unknown>;
  changeType: string;
  request?: NextRequest;
}): Promise<void> {
  await Promise.all([
    writeAuditLog({
      userId: params.userId,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before,
      after: params.after,
      request: params.request,
    }),
    createDataVersion({
      entity: params.entity,
      entityId: params.entityId,
      data: params.data,
      changedBy: params.userId,
      changeType: params.changeType,
    }),
  ]);
}
