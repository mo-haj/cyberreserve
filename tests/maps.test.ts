import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionsUrl, googleMapsUrl, isValidLatLng, osmEmbedUrl } from '../lib/maps';

test('map links are keyless and point at the pin', () => {
  const p = { lat: 33.5036, lng: 36.2546 };
  assert.equal(googleMapsUrl(p), 'https://www.google.com/maps/search/?api=1&query=33.503600%2C36.254600');
  assert.equal(directionsUrl(p), 'https://www.google.com/maps/dir/?api=1&destination=33.503600%2C36.254600');
  const embed = new URL(osmEmbedUrl(p));
  assert.equal(embed.hostname, 'www.openstreetmap.org');
  assert.equal(embed.searchParams.get('marker'), '33.503600,36.254600');
  const [w, s, e, n] = embed.searchParams.get('bbox')!.split(',').map(Number);
  assert.ok(w < p.lng && p.lng < e && s < p.lat && p.lat < n, 'pin inside the view');
  assert.ok(!osmEmbedUrl(p).includes('key='));
});

test('coordinates are checked', () => {
  assert.ok(isValidLatLng(33.5, 36.3));
  for (const [a, b] of [[null, 36], [91, 0], [0, 181], [NaN, 1], ['33', '36']]) assert.ok(!isValidLatLng(a, b));
});
