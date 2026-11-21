// Booking rules (pure: no database, no clock; callers pass `now`). Used by
// the booking pop-up for instant feedback and by the API as the real check.
import { damascusHour, startOfDamascusDay } from '@/lib/time';

export const BOOKING = {
  /** How far ahead a player can book. */
  maxDaysAhead: 7,
  minMinutes: 60,
  maxMinutes: 12 * 60,
  stepMinutes: 30,
  /** "Still coming?" is sent this long before the start... */
  reminderBeforeMin: 60,
  /** ...or this long before, for bookings made less than 70 minutes ahead... */
  lateReminderBeforeMin: 30,
  /** ...and with no answer the booking is cancelled this long before the start. */
  answerByBeforeMin: 15,
  /** A booking made less than this long before its start gets no reminder. */
  remindIfBookedAheadMin: 45,
  /** Night prices apply from 00:00 to 08:00 Damascus time. */
  nightFromHour: 0,
  nightToHour: 8,
  /** A start a few minutes in the past is accepted ("now", slow network). */
  pastGraceMin: 5,
  /** One upcoming or running online booking per player. */
  maxActivePerPlayer: 1,
  /** No-shows before a player is blocked from booking, and for how long. */
  strikesToBlock: 3,
  blockDays: 7,
} as const;

const MIN = 60_000;

export type BookingCheck =
  | 'ok'
  | 'too_soon' // start is in the past
  | 'too_far' // more than 7 days ahead
  | 'bad_length'; // not 1–12 h in 30-minute steps

export function checkRequest(start: Date, minutes: number, now: Date): BookingCheck {
  if (!Number.isInteger(minutes) || minutes < BOOKING.minMinutes || minutes > BOOKING.maxMinutes || minutes % BOOKING.stepMinutes !== 0) {
    return 'bad_length';
  }
  if (start.getTime() < now.getTime() - BOOKING.pastGraceMin * MIN) return 'too_soon';
  if (start.getTime() > now.getTime() + BOOKING.maxDaysAhead * 24 * 60 * MIN) return 'too_far';
  return 'ok';
}

export function isNight(instant: Date): boolean {
  const h = damascusHour(instant);
  return h >= BOOKING.nightFromHour && h < BOOKING.nightToHour;
}

/**
 * Price of a session: each minute at the day or night rate of its Damascus
 * hour, summed and rounded to whole SP. Rates are per hour.
 */
export function priceFor(start: Date, minutes: number, dayRate: number, nightRate: number): number {
  let total = 0;
  // Rates only change on whole hours, so step a minute at a time cheaply in blocks.
  let t = start.getTime();
  let left = minutes;
  while (left > 0) {
    const at = new Date(t);
    const minuteOfHour = Math.floor((t / MIN) % 60);
    const block = Math.min(left, 60 - minuteOfHour);
    total += (block / 60) * (isNight(at) ? nightRate : dayRate);
    t += block * MIN;
    left -= block;
  }
  return Math.round(total);
}

/**
 * An arena offer. All kinds need a booking of at least `hours`:
 * - package: `hours` for a total of `price`, then the normal price for the rest;
 * - rate:    from `hours`, every hour costs `price`;
 * - percent: from `hours`, `price` % off the normal price.
 */
export type OfferKind = 'package' | 'rate' | 'percent';
export const OFFER_KINDS: readonly OfferKind[] = ['package', 'rate', 'percent'];

export interface PriceOffer {
  hours: number;
  price: number;
  kind?: OfferKind;
}

/** The price of one booking with one offer, or null when it does not apply. */
export function offerTotal(start: Date, minutes: number, dayRate: number, nightRate: number, o: PriceOffer): number | null {
  const need = o.hours * 60;
  if (o.hours < 1 || need > minutes || o.price <= 0) return null;
  switch (o.kind ?? 'package') {
    case 'rate':
      return Math.round((o.price * minutes) / 60);
    case 'percent':
      if (o.price >= 100) return null;
      return Math.round(priceFor(start, minutes, dayRate, nightRate) * (1 - o.price / 100));
    default:
      return Math.round(o.price + priceFor(new Date(start.getTime() + need * MIN), minutes - need, dayRate, nightRate));
  }
}

/** The cheapest of the normal price and every offer that applies. */
export function priceWithOffers(
  start: Date,
  minutes: number,
  dayRate: number,
  nightRate: number,
  offers: PriceOffer[],
): { price: number; normal: number; offer: PriceOffer | null } {
  const normal = priceFor(start, minutes, dayRate, nightRate);
  let best = { price: normal, normal, offer: null as PriceOffer | null };
  for (const o of offers) {
    const total = offerTotal(start, minutes, dayRate, nightRate, o);
    if (total !== null && total < best.price) best = { price: total, normal, offer: o };
  }
  return best;
}

/** Half-open ranges [start, end) overlap. Same rule as the database constraint. */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** The 7 bookable Damascus days, starting today (UTC instants of their midnights). */
export function bookableDays(now: Date): Date[] {
  const first = startOfDamascusDay(now);
  return Array.from({ length: BOOKING.maxDaysAhead }, (_, i) => new Date(first.getTime() + i * 24 * 60 * MIN));
}

/** Start times on a day, every 30 minutes, from the next half hour after `now`. */
export function slotsOn(day: Date, now: Date): Date[] {
  const step = BOOKING.stepMinutes * MIN;
  const earliest = Math.ceil(now.getTime() / step) * step;
  const out: Date[] = [];
  for (let t = day.getTime(); t < day.getTime() + 24 * 60 * MIN; t += step) {
    if (t >= earliest && t <= now.getTime() + BOOKING.maxDaysAhead * 24 * 60 * MIN) out.push(new Date(t));
  }
  return out;
}

/** Whether a player is currently blocked from booking (too many no-shows). */
export function isBlocked(bannedUntil: Date | null, isBanned: boolean, now: Date): boolean {
  return isBanned || (bannedUntil !== null && bannedUntil.getTime() > now.getTime());
}

/**
 * When to ask "still coming?" for a booking, or null for none.
 * Booked 70+ min ahead: 60 min before the start. Booked 45–70 min ahead:
 * 30 min before (so the question never comes right after booking).
 * Booked less than 45 min ahead: no question, the player clearly means it.
 */
export function reminderAt(createdAt: Date, start: Date): Date | null {
  const lead = start.getTime() - createdAt.getTime();
  if (lead < BOOKING.remindIfBookedAheadMin * MIN) return null;
  const before = lead >= (BOOKING.reminderBeforeMin + 10) * MIN ? BOOKING.reminderBeforeMin : BOOKING.lateReminderBeforeMin;
  return new Date(start.getTime() - before * MIN);
}
