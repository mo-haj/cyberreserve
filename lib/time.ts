// The ONLY place in the codebase allowed to read the current time or do
// timezone math. Business logic must never call `new Date()` directly.
//
// Storage is always UTC (timestamptz). Display and business calculations use
// Asia/Damascus, which is a fixed UTC+3 with no DST (permanent since Oct 2022).
// The offset is a constant on purpose: explicit, and independent of the ICU /
// tzdata shipped in the container. Do not use these helpers for dates before
// October 2022.

export const BUSINESS_TIMEZONE = 'Asia/Damascus';
export const DAMASCUS_UTC_OFFSET_HOURS = 3;

const OFFSET_MS = DAMASCUS_UTC_OFFSET_HOURS * 60 * 60 * 1000;

export interface DamascusParts {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31 */
  day: number;
  /** 0–23 */
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  /** 0 = Sunday … 6 = Saturday */
  weekday: number;
}

/** Current instant. The single source of "now" for the application. */
export function now(): Date {
  return new Date();
}

/** Wall-clock components of an instant, as seen in Damascus. */
export function toDamascusParts(instant: Date): DamascusParts {
  const shifted = new Date(instant.getTime() + OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds(),
    weekday: shifted.getUTCDay(),
  };
}

/** The UTC instant for a given Damascus wall-clock time. */
export function fromDamascusParts(parts: {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
  millisecond?: number;
}): Date {
  const utcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
    parts.millisecond ?? 0,
  );
  return new Date(utcMs - OFFSET_MS);
}

/** Hour of day (0–23) in Damascus. */
export function damascusHour(instant: Date): number {
  return toDamascusParts(instant).hour;
}

/** The UTC instant of 00:00 Damascus time on the Damascus day containing `instant`. */
export function startOfDamascusDay(instant: Date): Date {
  const p = toDamascusParts(instant);
  return fromDamascusParts({ year: p.year, month: p.month, day: p.day });
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

/** `YYYY-MM-DD` in Damascus. */
export function formatDamascusDate(instant: Date): string {
  const p = toDamascusParts(instant);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** `HH:mm` (24h) in Damascus. */
export function formatDamascusTime(instant: Date): string {
  const p = toDamascusParts(instant);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** `YYYY-MM-DD HH:mm` in Damascus. */
export function formatDamascusDateTime(instant: Date): string {
  return `${formatDamascusDate(instant)} ${formatDamascusTime(instant)}`;
}
