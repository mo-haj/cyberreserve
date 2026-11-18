// Random secrets and their hashes. Only hashes are ever stored in the database,
// so a leaked database does not leak working sessions or login tokens.
import { createHash, randomBytes, randomInt } from 'node:crypto';

/** 32 random bytes, URL-safe. */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Short id shown to Telegram (start parameter, button data). 16 chars, [A-Za-z0-9_-]. */
export function newShortId(): string {
  return randomBytes(12).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Six-digit code the player types in Telegram (100000–999999). */
export function newCode(): number {
  return randomInt(100_000, 1_000_000);
}

/** True for strings that could be a token we issued (base64url, 43 chars). */
export function looksLikeSecret(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
