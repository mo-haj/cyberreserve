// Runs once when the server starts (Next.js instrumentation hook).
// The NEXT_RUNTIME check must wrap the import directly: Next.js then leaves
// the booking code (database, files) out of the Edge build.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startBookingJobs } = await import('@/lib/booking/jobs');
    startBookingJobs();
  }
}
