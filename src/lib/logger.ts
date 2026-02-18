import { NextRequest } from "next/server";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
  userId?: string;
  statusCode?: number;
  durationMs?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  meta?: Record<string, unknown>;
}

function formatError(err: unknown): LogEntry["error"] | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { name: "UnknownError", message: String(err) };
}

function extractRequestInfo(req?: NextRequest) {
  if (!req) return {};
  return {
    method: req.method,
    path: req.nextUrl?.pathname,
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      undefined,
    userAgent: req.headers.get("user-agent") || undefined,
  };
}

function emit(entry: LogEntry) {
  // Cloud Run / GCP structured logging uses JSON to stdout/stderr
  const output = JSON.stringify(entry);
  if (entry.level === "error") {
    console.error(output);
  } else if (entry.level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * Structured logger for API routes.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *
 *   // Basic error logging
 *   logger.error("Login failed", error, request);
 *
 *   // With extra metadata
 *   logger.error("Payment create failed", error, request, { paymentId: "123" });
 *
 *   // Info / warn
 *   logger.info("User logged in", request, { userId: "abc" });
 */
export const logger = {
  info(message: string, req?: NextRequest, meta?: Record<string, unknown>) {
    emit({
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      ...extractRequestInfo(req),
      meta,
    });
  },

  warn(message: string, req?: NextRequest, meta?: Record<string, unknown>) {
    emit({
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      ...extractRequestInfo(req),
      meta,
    });
  },

  error(
    message: string,
    err?: unknown,
    req?: NextRequest,
    meta?: Record<string, unknown>,
  ) {
    emit({
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      ...extractRequestInfo(req),
      error: formatError(err),
      meta,
    });
  },
};
