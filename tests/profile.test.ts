import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveStartCity } from '../lib/cities';
import { cleanFullName, isProfileComplete, isValidFullName, isValidNickname, nicknameKey, ProfileInput } from '../lib/profile';

test('full name: two real words, any language', () => {
  for (const ok of ['Lina Haddad', 'علي محمد', "Sam O'Neil", 'Jean-Luc Picard', '  Rami   Khoury  ']) {
    assert.ok(isValidFullName(ok), ok);
  }
  for (const bad of ['', 'Ali', 'علي', 'A B', 'x1 y2', 'Rami <b>', 'R'.repeat(61) + ' X']) {
    assert.ok(!isValidFullName(bad), bad);
  }
  assert.equal(cleanFullName('  Rami   Khoury '), 'Rami Khoury');
});

test('player name: 3–20 chars, no spaces, case-insensitive key', () => {
  for (const ok of ['Ghost', 'xX_sniper_Xx', 'شبح', 'pro.player-1', '007']) assert.ok(isValidNickname(ok), ok);
  for (const bad of ['ab', 'with space', '___', 'a'.repeat(21), 'emoji😀', '<script>']) assert.ok(!isValidNickname(bad), bad);
  assert.equal(nicknameKey('GhOsT'), nicknameKey('ghost'));
});

test('profile input parses and cleans', () => {
  const r = ProfileInput.safeParse({ fullName: ' Rami  Khoury ', nickname: ' Ghost ', homeCity: 'aleppo', acceptTerms: true });
  assert.ok(r.success);
  assert.deepEqual(r.success && r.data, { fullName: 'Rami Khoury', nickname: 'Ghost', homeCity: 'aleppo', acceptTerms: true });
  assert.ok(!ProfileInput.safeParse({ fullName: 'Rami', nickname: 'Ghost', homeCity: 'aleppo' }).success);
  assert.ok(!ProfileInput.safeParse({ fullName: 'Rami Khoury', nickname: 'Ghost', homeCity: 'paris' }).success, 'unknown city');
  const base = { fullName: 'Rami Khoury', nickname: 'Ghost', termsAcceptedAt: new Date(), homeCity: 'homs' };
  assert.ok(isProfileComplete(base));
  assert.ok(!isProfileComplete({ ...base, termsAcceptedAt: null }));
  assert.ok(!isProfileComplete({ ...base, homeCity: null }), 'city is required');
});

test('home page start city: link > last pick > profile city > all', () => {
  assert.equal(resolveStartCity('aleppo', 'homs', 'hama'), 'aleppo');
  assert.equal(resolveStartCity('nowhere', 'homs', 'hama'), null, 'bad link = all Syria');
  assert.equal(resolveStartCity(undefined, 'homs', 'hama'), 'homs');
  assert.equal(resolveStartCity(undefined, 'all', 'hama'), null, 'chose All Syria');
  assert.equal(resolveStartCity(undefined, undefined, 'hama'), 'hama');
  assert.equal(resolveStartCity(undefined, 'junk', undefined), null);
});
