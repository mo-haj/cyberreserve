import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countByType, countStatuses, derivePcViews, type BookingInput, type DeviceInput } from '../lib/availability';

const now = new Date('2026-11-18T10:00:00.000Z');
const at = (iso: string) => new Date(iso);

const devices: DeviceInput[] = [
  { id: 'd3', pcNumber: 3, isMaintenance: false, specs: null },
  { id: 'd1', pcNumber: 1, isMaintenance: false, specs: 'RTX 4060' },
  { id: 'd2', pcNumber: 2, isMaintenance: true, specs: null },
];

test('no bookings: every working PC is free, sorted by number', () => {
  const pcs = derivePcViews(devices, [], now);
  assert.deepEqual(
    pcs.map((p) => [p.pcNumber, p.status]),
    [
      [1, 'free'],
      [2, 'maintenance'],
      [3, 'free'],
    ],
  );
});

test('a PENDING or CONFIRMED booking covering now makes the PC busy', () => {
  for (const status of ['PENDING', 'CONFIRMED']) {
    const b: BookingInput = {
      deviceId: 'd1',
      startTime: at('2026-11-18T09:00:00Z'),
      endTime: at('2026-11-18T11:00:00Z'),
      status,
    };
    const pc = derivePcViews(devices, [b], now).find((p) => p.pcNumber === 1)!;
    assert.equal(pc.status, 'busy', status);
    assert.equal(pc.busyUntil, '2026-11-18T11:00:00.000Z');
  }
});

test('cancelled, completed and no-show bookings never hold a PC', () => {
  for (const status of ['CANCELLED', 'COMPLETED', 'NO_SHOW']) {
    const b: BookingInput = {
      deviceId: 'd1',
      startTime: at('2026-11-18T09:00:00Z'),
      endTime: at('2026-11-18T11:00:00Z'),
      status,
    };
    assert.equal(derivePcViews(devices, [b], now)[0].status, 'free', status);
  }
});

test('half-open range: busy at the start instant, free at the end instant', () => {
  const startsNow: BookingInput = { deviceId: 'd1', startTime: now, endTime: at('2026-11-18T11:00:00Z'), status: 'CONFIRMED' };
  const endsNow: BookingInput = { deviceId: 'd3', startTime: at('2026-11-18T09:00:00Z'), endTime: now, status: 'CONFIRMED' };
  const pcs = derivePcViews(devices, [startsNow, endsNow], now);
  assert.equal(pcs.find((p) => p.pcNumber === 1)!.status, 'busy');
  assert.equal(pcs.find((p) => p.pcNumber === 3)!.status, 'free');
});

test('future and past bookings do not affect the current status', () => {
  const future: BookingInput = { deviceId: 'd1', startTime: at('2026-11-18T12:00:00Z'), endTime: at('2026-11-18T13:00:00Z'), status: 'CONFIRMED' };
  const past: BookingInput = { deviceId: 'd3', startTime: at('2026-11-18T07:00:00Z'), endTime: at('2026-11-18T08:00:00Z'), status: 'CONFIRMED' };
  const pcs = derivePcViews(devices, [future, past], now);
  assert.ok(pcs.every((p) => p.status !== 'busy'));
});

test('maintenance wins over a booking', () => {
  const b: BookingInput = { deviceId: 'd2', startTime: at('2026-11-18T09:00:00Z'), endTime: at('2026-11-18T11:00:00Z'), status: 'CONFIRMED' };
  assert.equal(derivePcViews(devices, [b], now).find((p) => p.pcNumber === 2)!.status, 'maintenance');
});

test('counts add up', () => {
  const b: BookingInput = { deviceId: 'd1', startTime: at('2026-11-18T09:00:00Z'), endTime: at('2026-11-18T11:00:00Z'), status: 'CONFIRMED' };
  assert.deepEqual(countStatuses(derivePcViews(devices, [b], now)), { total: 3, free: 1, busy: 1, maintenance: 1 });
});

test('stations are grouped by type and numbered within their type', () => {
  const mixed: DeviceInput[] = [
    { id: 'c1', pcNumber: 13, isMaintenance: false, specs: null, type: 'PS5', hourlyRate: '200' },
    { id: 'p1', pcNumber: 1, isMaintenance: false, specs: null },
    { id: 'c2', pcNumber: 14, isMaintenance: true, specs: null, type: 'PS5' },
    { id: 'x1', pcNumber: 20, isMaintenance: false, specs: null, type: 'XBOX' },
    { id: 'p2', pcNumber: 2, isMaintenance: false, specs: null, type: 'PC' },
  ];
  const views = derivePcViews(mixed, [], now);
  assert.deepEqual(
    views.map((v) => `${v.type}${v.typeIndex}#${v.pcNumber}`),
    ['PC1#1', 'PC2#2', 'PS51#13', 'PS52#14', 'XBOX1#20'],
  );
  assert.equal(views[2].hourlyRate, '200');
  assert.deepEqual(countByType(views), [
    { type: 'PC', total: 2, free: 2 },
    { type: 'PS5', total: 2, free: 1 },
    { type: 'XBOX', total: 1, free: 1 },
  ]);
});
