// Preview mode (PREVIEW_MODE=1, e.g. on Vercel to show the design): the 3 demo
// arenas are served from prisma/demo-data.ts with no database, sign-in and
// booking are switched off, and the minute job does not run.
// DEV_FIXTURE_DATA=1 is the older name of the same switch.
export function isPreview(): boolean {
  return process.env.PREVIEW_MODE === '1' || process.env.DEV_FIXTURE_DATA === '1';
}
