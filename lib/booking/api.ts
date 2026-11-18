// Input schemas for the booking API.
import { z } from 'zod';

export const CreateBookingInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  pcNumber: z.number().int().min(1).max(999),
  /** "now", or an ISO time. */
  start: z.union([z.literal('now'), z.string().datetime()]),
  minutes: z.number().int().min(30).max(24 * 60),
});
