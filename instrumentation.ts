// Runs once when the server starts (Next.js instrumentation hook). Starts the
// booking job: "still coming?" reminders, cancelling unanswered bookings and
// closing finished ones, once a minute. Set BOOKING_JOBS=off to disable.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.BOOKING_JOBS === 'off') return;
  // Preview mode has no database. On Vercel nothing stays running between
  // requests: there the job is called from outside (/api/cron/tick).
  if (process.env.VERCEL) return;
  if (process.env.PREVIEW_MODE === '1' || process.env.DEV_FIXTURE_DATA === '1') return;
  const { tick } = await import('@/lib/booking/service');
  let running = false;
  const run = async () => {
    if (running) return; // never overlap with a slow previous run
    running = true;
    try {
      await tick();
    } catch (err) {
      console.error('[booking-job] failed:', err instanceof Error ? err.message : err);
    } finally {
      running = false;
    }
  };
  setTimeout(run, 15_000);
  setInterval(run, 60_000).unref?.();
  console.log('[booking-job] started (every minute)');
}
