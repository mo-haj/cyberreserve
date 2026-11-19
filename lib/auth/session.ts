// Login requests and browser sessions (server only).

import { isSuperAdminTelegram } from '@/lib/auth/admin';
import { cookies } from 'next/headers';
import { LoginStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';
import { isProfileComplete } from '@/lib/profile';
import { hashSecret, looksLikeSecret, newCode, newSecret, newShortId } from '@/lib/auth/tokens';

export const SESSION_COOKIE = 'cr_session';
const SESSION_DAYS = 30;
const LOGIN_REQUEST_MINUTES = 10;

export interface CurrentUser {
  id: string;
  /** Player name if set, otherwise the Telegram name. */
  name: string;
  /** Full name, player name, city and accepted terms are all set. */
  profileComplete: boolean;
  homeCity: string | null;
  /** Owner or staff of at least one arena, or super admin (shows the dashboard link). */
  manages: boolean;
  /** The site owner (ADMIN_TELEGRAM_IDS): can manage every arena. */
  superAdmin: boolean;
}

export async function createLoginRequest(locale: 'ar' | 'en' = 'ar') {
  const token = newSecret();
  const shortId = newShortId();
  const code = newCode();
  const expiresAt = new Date(now().getTime() + LOGIN_REQUEST_MINUTES * 60_000);
  await prisma.loginRequest.create({
    data: { id: hashSecret(token), shortId, code, expiresAt, locale },
  });
  return { token, shortId, code, expiresAt };
}

export type LoginPoll =
  | { status: 'pending' }
  | { status: 'expired' }
  | { status: 'failed' }
  | { status: 'signed_in'; sessionToken: string; sessionExpires: Date; profileComplete: boolean };

/**
 * Called by the browser that started the login. When Telegram has confirmed,
 * opens exactly one session: the CONFIRMED -> CONSUMED switch is atomic.
 */
export async function pollLoginRequest(token: string): Promise<LoginPoll> {
  if (!looksLikeSecret(token)) return { status: 'expired' };
  const id = hashSecret(token);
  const request = await prisma.loginRequest.findUnique({ where: { id } });
  if (!request) return { status: 'expired' };
  if (request.status === LoginStatus.FAILED) return { status: 'failed' };
  if (request.status === LoginStatus.CONSUMED) return { status: 'expired' };
  if (request.expiresAt <= now()) return { status: 'expired' };
  if (request.status !== LoginStatus.CONFIRMED || !request.userId) return { status: 'pending' };

  const claimed = await prisma.loginRequest.updateMany({
    where: { id, status: LoginStatus.CONFIRMED },
    data: { status: LoginStatus.CONSUMED },
  });
  if (claimed.count !== 1) return { status: 'expired' };

  const sessionToken = newSecret();
  const sessionExpires = new Date(now().getTime() + SESSION_DAYS * 24 * 60 * 60_000);
  await prisma.session.create({
    data: { id: hashSecret(sessionToken), userId: request.userId, expiresAt: sessionExpires },
  });
  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { fullName: true, nickname: true, termsAcceptedAt: true, homeCity: true },
  });
  return { status: 'signed_in', sessionToken, sessionExpires, profileComplete: !!user && isProfileComplete(user) };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !looksLikeSecret(token)) return null;
  try {
    const session = await prisma.session.findUnique({
      where: { id: hashSecret(token) },
      select: {
        expiresAt: true,
        user: {
          select: {
            id: true,
            name: true,
            fullName: true,
            nickname: true,
            termsAcceptedAt: true,
            homeCity: true,
            telegramChatId: true,
            _count: { select: { arenas: true } },
          },
        },
      },
    });
    if (!session || session.expiresAt <= now()) return null;
    const u = session.user;
    return {
      id: u.id,
      name: u.nickname ?? u.name,
      profileComplete: isProfileComplete(u),
      homeCity: u.homeCity,
      manages: u._count.arenas > 0 || isSuperAdminTelegram(u.telegramChatId),
      superAdmin: isSuperAdminTelegram(u.telegramChatId),
    };
  } catch (err) {
    // A database hiccup must not take pages down; the visitor just looks signed out.
    console.error('[auth] session lookup failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function endSession(token: string | undefined): Promise<void> {
  if (!token || !looksLikeSecret(token)) return;
  await prisma.session.deleteMany({ where: { id: hashSecret(token) } });
}

/** Cookie options: Secure whenever the visitor came over HTTPS (Cloudflare). */
export function sessionCookieOptions(request: Request, expires: Date) {
  const https =
    new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  return { httpOnly: true, sameSite: 'lax' as const, secure: https, path: '/', expires };
}
