import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING, bookableDays, checkRequest, isBlocked, overlaps, priceFor, priceWithOffers, reminderAt, slotsOn } from '../lib/booking/rules';
import { fromDamascusParts, formatDamascusDateTime } from '../lib/time';

const at = (d: number, h: number, m = 0) => fromDamascusParts({ year: 2026, month: 11, day: d, hour: h, minute: m });
const now = at(18, 16, 7);

test('requests: length and window', () => {
  assert.equal(checkRequest(now, 60, now), 'ok');
  assert.equal(checkRequest(new Date(now.getTime() - 3 * 60_000), 120, now), 'ok', 'a few minutes late is fine');
  assert.equal(checkRequest(at(18, 15), 60, now), 'too_soon');
  assert.equal(checkRequest(at(25, 16), 60, now), 'ok', 'exactly 7 days minus a bit');
  assert.equal(checkRequest(at(25, 17), 60, now), 'too_far');
  for (const bad of [30, 45, 90.5, 750, 0]) assert.equal(checkRequest(now, bad, now), 'bad_length', String(bad));
  assert.equal(checkRequest(now, 90, now), 'ok');
});

test('price: day and night rates by Damascus hour', () => {
  assert.equal(priceFor(at(18, 16), 120, 150, 120), 300, '2 h by day');
  assert.equal(priceFor(at(18, 23), 120, 150, 120), 270, '23:00-01:00 = 1 h day + 1 h night');
  assert.equal(priceFor(at(19, 7, 30), 60, 150, 120), 135, '07:30-08:30 = half night + half day');
  assert.equal(priceFor(at(19, 2), 90, 150, 120), 180, 'all night');
});

test('overlap is half-open, like the database', () => {
  assert.ok(overlaps(at(18, 16), at(18, 18), at(18, 17), at(18, 19)));
  assert.ok(!overlaps(at(18, 16), at(18, 18), at(18, 18), at(18, 19)), 'back-to-back is fine');
});

test('days and time slots', () => {
  const days = bookableDays(now);
  assert.equal(days.length, BOOKING.maxDaysAhead);
  assert.equal(formatDamascusDateTime(days[0]), '2026-11-18 00:00');
  const today = slotsOn(days[0], now);
  assert.equal(formatDamascusDateTime(today[0]), '2026-11-18 16:30', 'next half hour');
  assert.equal(formatDamascusDateTime(today[today.length - 1]), '2026-11-18 23:30');
  assert.equal(slotsOn(days[1], now).length, 48);
});

test('blocked players', () => {
  assert.ok(isBlocked(null, true, now));
  assert.ok(isBlocked(at(20, 0), false, now));
  assert.ok(!isBlocked(at(17, 0), false, now));
  assert.ok(!isBlocked(null, false, now));
});

test('"still coming?" timing depends on how far ahead the booking was made', () => {
  const start = at(18, 18, 30);
  const fmt = (d: Date | null) => (d ? formatDamascusDateTime(d) : null);
  assert.equal(fmt(reminderAt(at(18, 14, 0), start)), '2026-11-18 17:30', 'booked hours ahead: 1 h before');
  assert.equal(fmt(reminderAt(at(18, 17, 20), start)), '2026-11-18 17:30', 'booked 70 min ahead: 1 h before');
  assert.equal(fmt(reminderAt(at(18, 17, 40), start)), '2026-11-18 18:00', 'booked 50 min ahead: 30 min before');
  assert.equal(reminderAt(at(18, 17, 50), start), null, 'booked 40 min ahead: no question');
  assert.equal(BOOKING.answerByBeforeMin, 15);
});

test('offers: cheapest of normal price and one offer plus the rest', () => {
  const start = at(18, 12);
  const offers = [{ hours: 5, price: 600 }, { hours: 10, price: 1000 }];
  assert.equal(priceWithOffers(start, 120, 150, 150, offers).price, 300, 'too short for an offer');
  const five = priceWithOffers(start, 300, 150, 150, offers);
  assert.equal(five.price, 600);
  assert.equal(five.normal, 750);
  assert.equal(five.offer?.hours, 5);
  assert.equal(priceWithOffers(start, 360, 150, 150, offers).price, 750, '5 h offer + 1 h normal');
  assert.equal(priceWithOffers(start, 600, 150, 150, offers).price, 1000, '10 h offer');
  assert.equal(priceWithOffers(start, 300, 100, 100, [{ hours: 5, price: 900 }]).offer, null, 'a dearer "offer" is ignored');
});

test('offers: an hourly rate from N hours, and a percent off', () => {
  const start = at(12, 12);
  const rate = [{ hours: 5, price: 120, kind: 'rate' as const }];
  assert.equal(priceWithOffers(start, 240, 150, 150, rate).price, 600, 'under 5 h: normal price');
  assert.equal(priceWithOffers(start, 300, 150, 150, rate).price, 600, '5 h at 120');
  assert.equal(priceWithOffers(start, 420, 150, 150, rate).price, 840, '7 h at 120');
  const pct = [{ hours: 5, price: 10, kind: 'percent' as const }];
  assert.equal(priceWithOffers(start, 300, 150, 150, pct).price, 675, '10 % off 750');
  assert.equal(priceWithOffers(start, 300, 150, 150, [{ hours: 5, price: 100, kind: 'percent' as const }]).offer, null, '100 % is not allowed');
});
