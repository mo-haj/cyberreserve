import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  botLocale,
  displayName,
  langCallback,
  parseLangCallback,
  formatCode,
  isBareStart,
  isOwnContact,
  normalizePhone,
  parseStartPayload,
  parseTypedCode,
} from '../lib/telegram/logic';
import { hashSecret, looksLikeSecret, newCode, newSecret, newShortId } from '../lib/auth/tokens';
import { rateLimit } from '../lib/rate-limit';

test('start payload: only "login_<id>" is accepted', () => {
  assert.equal(parseStartPayload('/start login_abcDEF12_-x'), 'abcDEF12_-x');
  assert.equal(parseStartPayload('/start@CyberBot login_abcdefgh'), 'abcdefgh');
  for (const bad of ['/start', '/start hello', '/start login_', '/start login_abc', 'login_abcdefgh', '/start login_abc$defgh', undefined]) {
    assert.equal(parseStartPayload(bad), null, String(bad));
  }
  assert.ok(isBareStart('/start'));
  assert.ok(!isBareStart('/start login_abcdefgh'));
});

test('codes are six digits and can be typed in any digit style', () => {
  for (let i = 0; i < 500; i++) {
    const code = newCode();
    assert.ok(code >= 100000 && code <= 999999);
    assert.equal(parseTypedCode(String(code)), code);
    assert.equal(parseTypedCode(formatCode(code)), code);
  }
  assert.equal(formatCode(482913), '482 913');
  assert.equal(parseTypedCode('٤٨٢٩١٣'), 482913, 'Arabic-Indic digits');
  assert.equal(parseTypedCode('۴۸۲۹۱۳'), 482913, 'Persian digits');
  assert.equal(parseTypedCode(' 482-913 '), 482913);
  for (const bad of ['', '12345', '1234567', '048291', 'abc123', '48291x', '/start', undefined]) {
    assert.equal(parseTypedCode(bad), null, String(bad));
  }
});

test('only the sender\'s own contact is accepted', () => {
  assert.ok(isOwnContact(111, 111));
  assert.ok(!isOwnContact(111, 222));
  assert.ok(!isOwnContact(111, undefined));
});

test('phone numbers are normalised', () => {
  assert.equal(normalizePhone('963 944 123 456'), '+963944123456');
  assert.equal(normalizePhone('+963-944-123456'), '+963944123456');
  assert.equal(normalizePhone('123'), null);
  assert.equal(normalizePhone('0944123456'), '+963944123456', 'Syrian local form');
  assert.equal(normalizePhone('00963944123456'), '+963944123456');
  assert.equal(normalizePhone('+49 151 23456789'), '+4915123456789', 'tourist number kept');
  assert.equal(normalizePhone('٠٩٤٤١٢٣٤٥٦'), '+963944123456');
});

test('names and bot language', () => {
  assert.equal(displayName('Sam', 'K'), 'Sam K');
  assert.equal(displayName('', undefined), 'Player');
  assert.equal(botLocale('ar'), 'ar');
  assert.equal(botLocale(undefined), 'ar');
  assert.equal(botLocale('en-GB'), 'en');
});

test('secrets: random, URL-safe, and only hashes are comparable', () => {
  const a = newSecret();
  const b = newSecret();
  assert.notEqual(a, b);
  assert.ok(looksLikeSecret(a));
  assert.ok(!looksLikeSecret('short'));
  assert.equal(hashSecret(a), hashSecret(a));
  assert.equal(hashSecret(a).length, 64);
  assert.ok(/^[A-Za-z0-9_-]{16}$/.test(newShortId()));
});

test('rate limit: allows the limit, blocks the next, resets after the window', () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.ok(rateLimit('ip-1', 5, 60_000, t0 + i));
  assert.ok(!rateLimit('ip-1', 5, 60_000, t0 + 10));
  assert.ok(rateLimit('ip-2', 5, 60_000, t0 + 10), 'other visitors are not affected');
  assert.ok(rateLimit('ip-1', 5, 60_000, t0 + 60_001));
});

test('language buttons round-trip and stay under 64 bytes', () => {
  const id = newShortId();
  assert.deepEqual(parseLangCallback(langCallback(id, 'en')), { shortId: id, locale: 'en' });
  assert.ok(langCallback(id, 'ar').length <= 64);
  for (const bad of ['lang:abc:en', `lang:${id}:fr`, `pick:${id}:42`, undefined]) assert.equal(parseLangCallback(bad), null);
});

test('bot commands are recognised, with or without the bot name', async () => {
  const { parseCommand, MEMBER_TEXT } = await import('../lib/telegram/logic');
  assert.equal(parseCommand('/bookings'), 'bookings');
  assert.equal(parseCommand('/Support@CyberReserveBot'), 'support');
  assert.equal(parseCommand('  /start login_abc'), 'start');
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand('/'), null);
  // Next booking shown only when there is one.
  assert.ok(MEMBER_TEXT.en.home('Ghost', 'PC 4').includes('PC 4'));
  assert.ok(!MEMBER_TEXT.ar.home('Ghost', null).includes('حجزك القادم'));
});

test('support contact is never the bot itself', async () => {
  const { supportContactFor } = await import('../lib/legal');
  const keep = { ...process.env };
  process.env.TELEGRAM_BOT_USERNAME = 'CyberReserveBot';
  process.env.SUPPORT_CONTACT = '@cyberreservebot';
  assert.equal(supportContactFor(), null);
  process.env.SUPPORT_CONTACT = 'help@example.com';
  assert.equal(supportContactFor(), 'help@example.com');
  delete process.env.SUPPORT_CONTACT;
  assert.equal(supportContactFor(), null);
  process.env = keep;
});

test('the bottom buttons work in both languages, like the commands', async () => {
  const { memberAction, MEMBER_BUTTONS } = await import('../lib/telegram/logic');
  assert.equal(memberAction(MEMBER_BUTTONS.ar.bookings), 'bookings');
  assert.equal(memberAction(MEMBER_BUTTONS.en.support), 'support');
  assert.equal(memberAction('/bookings'), 'bookings');
  assert.equal(memberAction('/help'), 'support');
  assert.equal(memberAction('hello'), null);
});
