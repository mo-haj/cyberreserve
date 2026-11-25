import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, formatKm } from '../lib/geo';

test('distance Damascus -> Homs is about 140 km', () => {
  const d = distanceKm({ lat: 33.5138, lng: 36.2765 }, { lat: 34.7324, lng: 36.7137 });
  assert.ok(d > 135 && d < 145, String(d));
  assert.equal(distanceKm({ lat: 33.5, lng: 36.3 }, { lat: 33.5, lng: 36.3 }), 0);
  assert.equal(formatKm(0.44), '0.4');
  assert.equal(formatKm(12.6), '13');
});
