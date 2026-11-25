// Opening hours as minutes after midnight, Damascus time.
import { toDamascusParts } from '@/lib/time';

/** "09:30" -> 570; anything else -> null. */
export function parseHHMM(v: string): number | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function toHHMM(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

/**
 * Open at this moment? null when the arena has not set its hours.
 * open == close means open 24 hours; close < open runs past midnight.
 */
export function isOpenAt(openMin: number | null, closeMin: number | null, at: Date): boolean | null {
  if (openMin == null || closeMin == null) return null;
  if (openMin === closeMin) return true;
  const p = toDamascusParts(at);
  const m = p.hour * 60 + p.minute;
  return openMin < closeMin ? m >= openMin && m < closeMin : m >= openMin || m < closeMin;
}

/** "10:00–02:00", "24h", or '' when not set. */
export function hoursLabel(openMin: number | null, closeMin: number | null): string {
  if (openMin == null || closeMin == null) return '';
  return openMin === closeMin ? '24h' : `${toHHMM(openMin)}–${toHHMM(closeMin)}`;
}
