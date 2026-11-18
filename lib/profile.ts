// Profile input schema for the API. The rules themselves live in
// ./profile-rules (no zod), so the browser form can use them cheaply.
import { z } from 'zod';
import { cityByKey } from '@/lib/cities';
import { cleanFullName, isValidFullName, isValidNickname } from '@/lib/profile-rules';

export { cleanFullName, isProfileComplete, isValidFullName, isValidNickname, nicknameKey } from '@/lib/profile-rules';

export const ProfileInput = z.object({
  fullName: z.string().max(200).refine(isValidFullName, 'fullName').transform(cleanFullName),
  nickname: z
    .string()
    .max(100)
    .refine(isValidNickname, 'nickname')
    .transform((v) => v.normalize('NFC').trim()),
  homeCity: z.string().max(40).refine((v) => !!cityByKey(v), 'homeCity'),
  acceptTerms: z.boolean().optional(),
});
export type ProfileInput = z.infer<typeof ProfileInput>;

