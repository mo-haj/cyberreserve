import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenAt, parseHHMM, toHHMM } from '../lib/hours';

// Damascus = UTC+3.
const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 25, (h - 3 + 24) % 24, m));

test('opening hours', () => {
  assert.equal(parseHHMM('09:30'), 570);
  assert.equal(parseHHMM('24:00'), null);
  assert.equal(toHHMM(570), '09:30');
  assert.equal(isOpenAt(null, null, at(12)), null);
  assert.equal(isOpenAt(600, 600, at(3)), true); // 24 h
  assert.equal(isOpenAt(10 * 60, 23 * 60, at(12)), true);
  assert.equal(isOpenAt(10 * 60, 23 * 60, at(23, 30)), false);
  // 14:00 -> 03:00 past midnight
  assert.equal(isOpenAt(14 * 60, 3 * 60, at(1)), true);
  assert.equal(isOpenAt(14 * 60, 3 * 60, at(9)), false);
});
