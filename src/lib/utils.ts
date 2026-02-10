import { v4 as uuidv4 } from "uuid";

/**
 * Format a Date to a Japanese-locale date string (YYYY/MM/DD).
 * Returns an empty string for null/undefined input.
 */
export function formatDate(
  date: Date | string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  };

  return d.toLocaleDateString("ja-JP", defaultOptions);
}

/**
 * Format a Date including time (YYYY/MM/DD HH:mm).
 */
export function formatDateTime(
  date: Date | string | null | undefined,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";

  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format an integer amount as Japanese Yen (JPY) currency string.
 * Example: 15000 -> "¥15,000"
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "";
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Merge CSS class names. Handles conditional classes via template-literal
 * or array-based approach. Filters out falsy values and joins with a space.
 *
 * Usage: cn("base", condition && "active", "extra")
 */
export function cn(
  ...inputs: (string | false | null | undefined)[]
): string {
  return inputs.filter(Boolean).join(" ");
}

/**
 * Generate a cryptographically random UUID v4 token.
 */
export function generateToken(): string {
  return uuidv4();
}

/**
 * Add days to a date, returning a new Date instance.
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Check whether a date is in the past (before the start of today).
 */
export function isOverdue(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

/**
 * Check whether a date is within the next N days from today.
 */
export function isApproaching(
  date: Date | string | null | undefined,
  withinDays: number,
): boolean {
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threshold = addDays(today, withinDays);
  return d >= today && d <= threshold;
}

/**
 * Truncate a string to a maximum length, appending an ellipsis if truncated.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "\u2026";
}

/**
 * Format a date as a relative string (e.g., "3日後", "2日前", "今日").
 * Returns null if the date is invalid or more than 30 days away.
 */
export function formatRelativeDate(
  date: Date | string | null | undefined,
): string | null {
  if (!date) return null;
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (Math.abs(diffDays) > 30) return null;
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "明日";
  if (diffDays === -1) return "昨日";
  if (diffDays > 0) return `${diffDays}日後`;
  return `${Math.abs(diffDays)}日前`;
}

/**
 * Extract an error message from a failed fetch Response.
 * Reads the JSON body's `error` field, falling back to a generic message with status code.
 */
export async function getApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return json.error || `${fallback} (${res.status})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

/**
 * Export data as a CSV file download.
 * @param filename - The name of the downloaded file (without .csv extension)
 * @param headers - Array of column header labels
 * @param rows - Array of row data (each row is an array of cell values)
 */
export function exportToCsv(
  filename: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): void {
  const escape = (val: string | number | null | undefined): string => {
    if (val == null) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escape).join(","),
    ...rows.map((row) => row.map(escape).join(",")),
  ].join("\n");

  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
