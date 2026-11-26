import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManageAction, NewArena, canDo, slugify } from '../lib/manage/rules';
import { isSuperAdminTelegram } from '../lib/auth/admin';

test('only the site owner may publish arenas; owners manage their staff', () => {
  for (const a of ['setPublished', 'deleteArena', 'subscription'] as const) {
    assert.equal(canDo('OWNER', a), false, `owner ${a}`);
    assert.equal(canDo('STAFF', a), false, `staff ${a}`);
    assert.equal(canDo('OWNER', a, true), true, `super ${a}`);
  }
  // An owner may add/remove members (the service limits it to STAFF); staff may not.
  for (const a of ['setMember', 'removeMember'] as const) {
    assert.equal(canDo('OWNER', a), true, `owner ${a}`);
    assert.equal(canDo('STAFF', a), false, `staff ${a}`);
  }
  // Owners manage their own posts; staff do not.
  assert.equal(canDo('OWNER', 'savePost'), true);
  assert.equal(canDo('STAFF', 'savePost'), false);
  assert.equal(canDo('STAFF', 'walkIn'), true);
});

test('admin list comes from ADMIN_TELEGRAM_IDS', () => {
  const keep = process.env.ADMIN_TELEGRAM_IDS;
  process.env.ADMIN_TELEGRAM_IDS = '"111111", 222222 abc';
  assert.equal(isSuperAdminTelegram('111111'), true);
  assert.equal(isSuperAdminTelegram('222222'), true);
  assert.equal(isSuperAdminTelegram('abc'), false);
  assert.equal(isSuperAdminTelegram(null), false);
  delete process.env.ADMIN_TELEGRAM_IDS;
  assert.equal(isSuperAdminTelegram('111111'), false, 'nobody is admin when unset');
  if (keep !== undefined) process.env.ADMIN_TELEGRAM_IDS = keep;
});

test('new arena: address and fields', () => {
  assert.equal(slugify('Mezzeh Arena!'), 'mezzeh-arena');
  assert.equal(slugify('  Old  City -- LAN  '), 'old-city-lan');
  const ok = { nameAr: 'صالة', nameEn: 'Arena', slug: 'arena-1', city: 'homs', areaAr: '', areaEn: '', hourlyRate: '150' };
  assert.ok(NewArena.safeParse(ok).success);
  assert.ok(!NewArena.safeParse({ ...ok, slug: 'Bad Slug' }).success);
  assert.ok(!NewArena.safeParse({ ...ok, city: 'paris' }).success);
  assert.ok(!NewArena.safeParse({ ...ok, hourlyRate: '0' }).success);
});

test('posts and members are validated', () => {
  assert.ok(ManageAction.safeParse({ action: 'savePost', titleAr: 'بطولة', titleEn: '', bodyAr: 'نص', bodyEn: '' }).success);
  assert.ok(!ManageAction.safeParse({ action: 'savePost', titleAr: 'x'.repeat(81), titleEn: '', bodyAr: '', bodyEn: '' }).success);
  assert.ok(ManageAction.safeParse({ action: 'setMember', phone: '0944123456', role: 'STAFF' }).success);
  assert.ok(!ManageAction.safeParse({ action: 'setMember', phone: '0944123456', role: 'ADMIN' }).success);
});
