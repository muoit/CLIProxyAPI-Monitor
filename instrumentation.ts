export async function register() {
  // Only run cron on Node.js runtime (not edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initCronJobs } = await import("./lib/cron");
    initCronJobs();
  }
}
