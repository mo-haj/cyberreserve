import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  damascusHour,
  formatDamascusDate,
  formatDamascusDateTime,
  fromDamascusParts,
  startOfDamascusDay,
  toDamascusParts,
} from '../lib/time';

test('UTC instant converts to Damascus wall clock (UTC+3)', () => {
  const p = toDamascusParts(new Date('2026-11-15T18:15:00.000Z'));
  assert.deepEqual(
    [p.year, p.month, p.day, p.hour, p.minute, p.weekday],
    [2026, 11, 15, 21, 15, 0],
  );
});

test('conversion crosses the date line correctly', () => {
  // 22:30 UTC on the 15th is 01:30 on the 16th in Damascus.
  const instant = new Date('2026-11-15T22:30:00.000Z');
  assert.equal(formatDamascusDate(instant), '2026-11-16');
  assert.equal(damascusHour(instant), 1);
  assert.equal(formatDamascusDateTime(instant), '2026-11-16 01:30');
});

test('fromDamascusParts is the inverse of toDamascusParts', () => {
  const instant = fromDamascusParts({ year: 2026, month: 1, day: 1, hour: 0, minute: 0 });
  assert.equal(instant.toISOString(), '2025-12-31T21:00:00.000Z');
  const p = toDamascusParts(instant);
  assert.equal(fromDamascusParts(p).getTime(), instant.getTime());
});

test('no DST: summer and winter use the same offset', () => {
  assert.equal(damascusHour(new Date('2026-01-10T09:00:00Z')), 12);
  assert.equal(damascusHour(new Date('2026-07-10T09:00:00Z')), 12);
});

test('startOfDamascusDay returns Damascus midnight as a UTC instant', () => {
  const start = startOfDamascusDay(new Date('2026-11-15T22:30:00.000Z'));
  assert.equal(start.toISOString(), '2026-11-15T21:00:00.000Z');
});

test('matches the platform tz database for Asia/Damascus', () => {
  const instant = new Date('2026-11-15T18:15:00.000Z');
  const viaIntl = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Damascus',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
  assert.equal(viaIntl, '21:15');
});
