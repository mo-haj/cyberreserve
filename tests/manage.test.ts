import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDo, ManageAction, parseLatLng } from '../lib/manage/rules';

test('map pin can be pasted as numbers or a Google Maps link', () => {
  assert.deepEqual(parseLatLng('33.5036, 36.2546'), { lat: 33.5036, lng: 36.2546 });
  assert.deepEqual(parseLatLng('33.5036,36.2546'), { lat: 33.5036, lng: 36.2546 });
  assert.deepEqual(parseLatLng('(33.5036, 36.2546)'), { lat: 33.5036, lng: 36.2546 });
  assert.deepEqual(parseLatLng('https://www.google.com/maps/@33.5128,36.3158,17z'), { lat: 33.5128, lng: 36.3158 });
  assert.deepEqual(parseLatLng('https://maps.google.com/?q=33.4985,36.2772'), { lat: 33.4985, lng: 36.2772 });
  for (const bad of ['', 'Damascus', '95, 36', '33.5', 'javascript:alert(1)']) assert.equal(parseLatLng(bad), null, bad);
});

test('actions are validated and staff are limited', () => {
  assert.ok(ManageAction.safeParse({ action: 'walkIn', pcNumber: 3, minutes: 60 }).success);
  assert.ok(!ManageAction.safeParse({ action: 'walkIn', pcNumber: 3, minutes: 5 }).success, 'too short');
  assert.ok(!ManageAction.safeParse({ action: 'deleteEverything' }).success);
  assert.ok(ManageAction.safeParse({ action: 'addStations', count: 4, type: 'PS5', hourlyRate: '200' }).success);
  assert.ok(!ManageAction.safeParse({ action: 'addStations', count: 4, type: 'PS9' }).success);
  assert.ok(!ManageAction.safeParse({ action: 'addStations', count: 1, type: 'PC', hourlyRate: '-5' }).success);
  assert.ok(canDo('STAFF', 'walkIn'));
  assert.ok(canDo('STAFF', 'maintenance'));
  assert.ok(!canDo('STAFF', 'editArena'));
  assert.ok(!canDo('STAFF', 'removeStation'));
  assert.ok(canDo('OWNER', 'setGames'));
});

import { checkImage, sniffImage } from '../lib/manage/images';

test('uploads: only real PNG/JPEG/WebP, within size', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]);
  const svg = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
  assert.equal(sniffImage(png), 'image/png');
  assert.equal(sniffImage(jpg), 'image/jpeg');
  assert.equal(sniffImage(webp), 'image/webp');
  assert.equal(sniffImage(svg), null);
  assert.deepEqual(checkImage('logo', svg), { ok: false, error: 'image_type' });
  assert.deepEqual(checkImage('logo', new Uint8Array(600 * 1024).fill(0xff)), { ok: false, error: 'image_size' });
  // A real JPEG start: SOI, then a SOF0 frame header with height and width.
  const jpegOf = (w: number, h: number, size: number) => {
    const b = new Uint8Array(size);
    b.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 3]);
    return b;
  };
  assert.ok(checkImage('cover', jpegOf(1600, 900, 1024 * 1024)).ok, '1 MB banner is fine');
  assert.ok(!checkImage('logo', jpegOf(512, 512, 1024 * 1024)).ok, '1 MB logo is too big');
  assert.deepEqual(checkImage('cover', jpegOf(20000, 20000, 300 * 1024)), { ok: false, error: 'image_size' }, 'a small file declaring a huge picture');
  assert.deepEqual(checkImage('cover', jpg), { ok: false, error: 'image_type' }, 'no size in the header = not a real image');
});
