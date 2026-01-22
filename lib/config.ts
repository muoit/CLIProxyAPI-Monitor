function normalizeBaseUrl(raw: string | undefined) {
  const value = (raw || "").trim();
  if (!value) return "";
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  const trimmed = withProtocol.replace(/\/$/, "");
  return trimmed.endsWith("/v0/management") ? trimmed : `${trimmed}/v0/management`;
}

const baseUrl = normalizeBaseUrl(process.env.CLIPROXY_API_BASE_URL);
const password = process.env.PASSWORD || process.env.CLIPROXY_SECRET_KEY || "";
const cronSecret = process.env.CRON_SECRET || "";

// Default timezone constant - single source of truth
export const DEFAULT_TIMEZONE = "Asia/Shanghai";

// Validate timezone format to prevent SQL injection
// Only allows: letters, underscores, forward slashes (e.g., Asia/Ho_Chi_Minh, America/New_York)
const VALID_TZ_REGEX = /^[A-Za-z_/]+$/;
function validateTimezone(tz: string): string {
  return VALID_TZ_REGEX.test(tz) ? tz : DEFAULT_TIMEZONE;
}

// Timezone for date/time display and database queries
// Examples: Asia/Ho_Chi_Minh, America/New_York, Europe/London, UTC
const timezone = validateTimezone(process.env.TIMEZONE || DEFAULT_TIMEZONE);

export const config = {
  cliproxy: {
    baseUrl,
    apiKey: process.env.CLIPROXY_SECRET_KEY || ""
  },
  postgresUrl: process.env.DATABASE_URL || "",
  password,
  cronSecret,
  timezone
};

export function assertEnv() {
  if (!config.cliproxy.apiKey) {
    throw new Error("CLIPROXY_SECRET_KEY is missing");
  }
  if (!config.cliproxy.baseUrl) {
    throw new Error("CLIPROXY_API_BASE_URL is missing");
  }
  if (!config.postgresUrl) {
    throw new Error("DATABASE_URL is missing");
  }
}
