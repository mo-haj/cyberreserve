// The minute job on a server that keeps running (Docker): "still coming?"
// reminders, cancelling unanswered bookings, closing finished ones.
// Started from instrumentation.ts. Set BOOKING_JOBS=off to disable.
import { tick } from '@/lib/booking/service';

export function startBookingJobs(): void {
  if (process.env.BOOKING_JOBS === 'off') return;
  // On Vercel nothing stays running between requests: there the job is
  // called from outside (/api/cron/tick).
  if (process.env.VERCEL) return;
  // Preview mode has no database.
  if (process.env.PREVIEW_MODE === '1' || process.env.DEV_FIXTURE_DATA === '1') return;
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
