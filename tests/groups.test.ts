import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fieldValue, fieldsFor, groupName, groupSummary, numberRanges, screenLine, sharedPrice, type GroupView } from '../lib/groups';
import { ManageAction, canDo } from '../lib/manage/rules';
import { BOOKING, checkRequest } from '../lib/booking/rules';

const zone: GroupView = {
  id: 'g1', type: 'PC', nameAr: 'غرفة VIP', nameEn: '', noteAr: '', noteEn: 'Quiet room', isVip: true, imageUrl: null,
  cpu: 'Ryzen 7 7800X3D', gpu: 'RTX 4070', ram: '32 GB', storage: '', screen: '27" 1440p', refreshHz: 240,
  controllers: null, keyboard: '', mouse: 'G Pro', headset: '', chair: '',
};

test('station numbers collapse into ranges', () => {
  assert.equal(numberRanges([1, 2, 3, 4, 8, 11, 12], 'en'), '1–4, 8, 11, 12');
  assert.equal(numberRanges([5, 3, 4, 9], 'ar'), '3–5، 9');
  assert.equal(numberRanges([], 'en'), '');
});

test('zone card lines', () => {
  assert.equal(screenLine(zone), '27" 1440p · 240 Hz');
  assert.equal(screenLine({ screen: '', refreshHz: 144 }), '144 Hz');
  assert.equal(groupSummary(zone), 'RTX 4070 · 240 Hz · 32 GB');
  assert.equal(groupSummary({ type: 'PS5', gpu: '', ram: '', screen: '55" 4K', refreshHz: null }), '55" 4K');
  assert.equal(fieldValue(zone, 'storage'), '');
  assert.equal(fieldValue({ ...zone, type: 'PS5', controllers: 4 }, 'controllers'), '4');
  assert.deepEqual(fieldsFor('PS5').key, ['screen', 'controllers']);
  // Missing English name falls back to the Arabic one, and the other way round.
  assert.equal(groupName(zone, 'en'), 'غرفة VIP');
  assert.equal(groupName({ nameAr: '', nameEn: 'Main' }, 'ar'), 'Main');
  assert.equal(sharedPrice(['200', '200']), '200');
  assert.equal(sharedPrice(['200', '150']), null);
});

const save = {
  action: 'saveGroup', type: 'PC', nameAr: 'غرفة VIP', nameEn: 'VIP room', noteAr: '', noteEn: '', isVip: true,
  cpu: '', gpu: 'RTX 4080', ram: '', storage: '', screen: '', refreshHz: 360, controllers: null,
  keyboard: '', mouse: '', headset: '', chair: '', stations: [11, 12, 13],
};

test('zone actions are validated and owner-only', () => {
  assert.ok(ManageAction.safeParse(save).success);
  assert.ok(!ManageAction.safeParse({ ...save, refreshHz: 5 }).success, 'refresh too low');
  assert.ok(!ManageAction.safeParse({ ...save, gpu: 'x'.repeat(61) }).success, 'too long');
  assert.ok(!ManageAction.safeParse({ ...save, id: 'not-a-uuid' }).success);
  assert.ok(ManageAction.safeParse({ action: 'moveGroup', id: '4839a73f-4039-402d-82c3-75fd1ad6b1f4', by: -1 }).success);
  assert.ok(!ManageAction.safeParse({ action: 'moveGroup', id: '4839a73f-4039-402d-82c3-75fd1ad6b1f4', by: 3 }).success);
  for (const a of ['saveGroup', 'removeGroup', 'moveGroup'] as const) assert.equal(canDo('STAFF', a), false, a);
  assert.ok(ManageAction.safeParse({ action: 'editStation', pcNumber: 2, type: 'PC', groupId: '' }).success);
});

test('bookings can run up to 12 hours', () => {
  assert.equal(BOOKING.maxMinutes, 720);
  const at = new Date('2026-11-18T10:00:00Z');
  const start = new Date('2026-11-18T12:00:00Z');
  assert.equal(checkRequest(start, 720, at), 'ok');
  assert.equal(checkRequest(start, 750, at), 'bad_length');
});
