// Work to finish after the answer has been sent (Telegram messages about a
// booking). On Vercel a function stops when it has answered, so the work is
// handed to Next.js `after()`, which keeps it alive until done. Outside a
// request (the minute job on the Docker server) it simply runs on.
import { after } from 'next/server';

export function background(label: string, task: () => Promise<unknown>): void {
  const run = () =>
    task().catch((err) => {
      console.error(`[${label}] failed:`, err instanceof Error ? err.message : err);
    });
  try {
    after(run);
  } catch {
    void run();
  }
}
