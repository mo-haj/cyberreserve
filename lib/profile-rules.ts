// Player profile rules, shared by the profile form (instant feedback) and the
// API (the real check). Pure: no database.
import { cityByKey } from '@/lib/cities';

export function cleanFullName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim();
}

/** Letters of any language, with spaces, apostrophes, dots and hyphens; first + last name at least. */
export function isValidFullName(raw: string): boolean {
  const name = cleanFullName(raw);
  if (name.length < 5 || name.length > 60) return false;
  if (!/^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u.test(name)) return false;
  const words = name.split(' ').filter((w) => /[\p{L}]{2,}/u.test(w));
  return words.length >= 2;
}

/** 3–20 letters (any language), digits, _ - . ; no spaces; at least one letter or digit. */
export function isValidNickname(raw: string): boolean {
  const nick = raw.normalize('NFC').trim();
  return /^[\p{L}\p{M}\p{N}_.-]{3,20}$/u.test(nick) && /[\p{L}\p{N}]/u.test(nick);
}

/** Case-insensitive key: "Ghost", "GHOST" and "ghost" are the same player name. */
export function nicknameKey(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase();
}

export function isProfileComplete(u: {
  fullName: string | null;
  nickname: string | null;
  termsAcceptedAt: Date | null;
  homeCity: string | null;
}): boolean {
  return !!u.fullName && !!u.nickname && !!u.termsAcceptedAt && !!cityByKey(u.homeCity);
}
