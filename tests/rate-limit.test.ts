import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp } from '../lib/rate-limit';

const h = (o: Record<string, string>) => new Headers(o);

test('a visitor cannot pick their own rate-limit key with cf-connecting-ip', () => {
  delete process.env.VERCEL;
  delete process.env.BEHIND_CLOUDFLARE;
  assert.equal(clientIp(h({ 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '1.2.3.4, 10.0.0.1' })), '10.0.0.1', 'last hop = added by our proxy');
  assert.equal(clientIp(h({ 'x-forwarded-for': '1.1.1.2, 1.1.1.1' })), '1.1.1.1', 'a forged first hop changes nothing');
  process.env.BEHIND_CLOUDFLARE = '1';
  assert.equal(clientIp(h({ 'cf-connecting-ip': '5.5.5.5', 'x-forwarded-for': '1.2.3.4' })), '5.5.5.5', 'trusted only behind Cloudflare');
  delete process.env.BEHIND_CLOUDFLARE;
});

test('on Vercel the platform header wins', () => {
  process.env.VERCEL = '1';
  assert.equal(clientIp(h({ 'x-real-ip': '9.9.9.9', 'cf-connecting-ip': '6.6.6.6', 'x-forwarded-for': '7.7.7.7' })), '9.9.9.9');
  assert.equal(clientIp(h({ 'x-vercel-forwarded-for': '8.8.8.8' })), '8.8.8.8');
  assert.equal(clientIp(h({})), 'local');
  delete process.env.VERCEL;
});
