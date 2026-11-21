// Input schemas for the booking API.
import { z } from 'zod';

export const CreateBookingInput = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  /** One station; or leave it out and give `pool` to get any free one. */
  pcNumber: z.number().int().min(1).max(999).optional(),
  pool: z
    .object({
      type: z.enum(['PC', 'PS5', 'PS4', 'XBOX']),
      /** A zone id, or null for the stations of this type without a zone. */
      groupId: z.string().uuid().nullable(),
    })
    .optional(),
  /** "now", or an ISO time. */
  start: z.union([z.literal('now'), z.string().datetime()]),
  minutes: z.number().int().min(30).max(24 * 60),
});
