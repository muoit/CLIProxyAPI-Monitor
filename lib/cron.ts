import cron from "node-cron";

// Default: 21:00 UTC daily (same as Vercel cron)
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || "0 21 * * *";
const CRON_ENABLED = process.env.CRON_ENABLED !== "false";

let isInitialized = false;

export function initCronJobs() {
  // Prevent double initialization
  if (isInitialized || !CRON_ENABLED) return;

  const cronSecret = process.env.CRON_SECRET || process.env.PASSWORD || process.env.CLIPROXY_SECRET_KEY;
  if (!cronSecret) {
    console.log("[Cron] Skipped: No CRON_SECRET or PASSWORD configured");
    return;
  }

  if (!cron.validate(CRON_SCHEDULE)) {
    console.error(`[Cron] Invalid schedule: ${CRON_SCHEDULE}`);
    return;
  }

  cron.schedule(CRON_SCHEDULE, async () => {
    console.log(`[Cron] Running sync at ${new Date().toISOString()}`);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/sync`, {
        method: "GET",
        headers: { Authorization: `Bearer ${cronSecret}` }
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`[Cron] Sync completed: ${data.inserted}/${data.attempted} records`);
      } else {
        console.error(`[Cron] Sync failed: ${res.status} ${res.statusText}`);
      }
    } catch (error) {
      console.error("[Cron] Sync error:", error);
    }
  });

  isInitialized = true;
  console.log(`[Cron] Initialized with schedule: ${CRON_SCHEDULE}`);
}
