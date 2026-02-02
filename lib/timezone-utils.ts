import { config } from "@/lib/config";

/**
 * Get timezone offset in ms using Intl.DateTimeFormat.formatToParts (deterministic, environment-independent).
 * Works correctly regardless of server timezone (UTC on Vercel, local dev, etc).
 */
function getTimezoneOffsetMs(tz: string, refUtc: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(refUtc);
  const get = (type: Intl.DateTimeFormatPartTypes) => parseInt(parts.find(p => p.type === type)?.value || "0", 10);

  // Build UTC ms for the local representation
  const localYear = get("year");
  const localMonth = get("month") - 1;
  const localDay = get("day");
  const localHour = get("hour") === 24 ? 0 : get("hour"); // midnight can be reported as 24
  const localMinute = get("minute");
  const localSecond = get("second");
  const localMs = Date.UTC(localYear, localMonth, localDay, localHour, localMinute, localSecond);

  return localMs - refUtc.getTime();
}

/**
 * Returns UTC Date corresponding to 00:00:00.000 of the given date in the configured timezone.
 * Uses Intl.DateTimeFormat.formatToParts for deterministic offset - works on any server timezone.
 *
 * Example: timezone=Asia/Ho_Chi_Minh (UTC+7), date=2026-02-02
 * → Returns 2026-02-01T17:00:00.000Z (midnight Feb 2 in VN = 5pm Feb 1 UTC)
 */
export function withDayStartTz(date: Date): Date {
  const tz = config.timezone;
  // Get YYYY-MM-DD in target timezone (sv-SE locale gives ISO format)
  const dateStr = date.toLocaleDateString("sv-SE", { timeZone: tz });
  // Create UTC midnight for that date string
  const utcMidnight = new Date(dateStr + "T00:00:00Z");
  // Get the actual offset at that UTC point using deterministic formatToParts
  const offsetMs = getTimezoneOffsetMs(tz, utcMidnight);
  // Shift back by offset to get UTC time that equals midnight in target tz
  return new Date(utcMidnight.getTime() - offsetMs);
}

/**
 * Returns UTC Date corresponding to 23:59:59.999 of the given date in the configured timezone.
 * Endpoint is inclusive (last millisecond of the day).
 */
export function withDayEndTz(date: Date): Date {
  const start = withDayStartTz(date);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Parse a date input (string or Date) into a valid Date or null.
 */
export function parseDateInput(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
