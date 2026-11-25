// Arena activity: who did what, in which shift. Server only.
import { Prisma, type ActorType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';

/** OWNER / STAFF for a member of this arena, ADMIN for anyone else acting there (the site admin). */
export async function actorIn(cafeId: string, userId: string): Promise<ActorType> {
  const m = await prisma.arenaMember.findUnique({ where: { cafeId_userId: { cafeId, userId } }, select: { role: true } });
  return m ? (m.role === 'STAFF' ? 'STAFF' : 'OWNER') : 'ADMIN';
}

/** Write one activity line for an arena, tied to the person's open shift there. */
export async function logArena(p: {
  cafeId: string;
  userId?: string | null;
  actor?: ActorType;
  action: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  const actor = p.actor ?? (p.userId ? await actorIn(p.cafeId, p.userId) : 'SYSTEM');
  const shift =
    p.userId && actor !== 'PLAYER'
      ? await prisma.staffShift.findFirst({ where: { cafeId: p.cafeId, userId: p.userId, endedAt: null }, select: { id: true } })
      : null;
  await prisma.auditLog.create({
    data: { actorType: actor, userId: p.userId ?? null, cafeId: p.cafeId, shiftId: shift?.id ?? null, action: p.action, details: p.details ?? Prisma.JsonNull },
  });
}

// ------------------------------------------------------------------ shifts

export async function openShift(cafeId: string, userId: string) {
  return prisma.staffShift.findFirst({ where: { cafeId, userId, endedAt: null }, select: { id: true, startedAt: true } });
}

/** Start a shift (no-op when one is already open). */
export async function startShift(cafeId: string, userId: string): Promise<void> {
  if (await openShift(cafeId, userId)) return;
  try {
    await prisma.staffShift.create({ data: { cafeId, userId, startedAt: now() } });
  } catch (err) {
    // StaffShift_one_open: a second click at the same moment.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  await logArena({ cafeId, userId, action: 'shift.start' });
}

export async function endShift(cafeId: string, userId: string): Promise<boolean> {
  const at = now();
  await logArena({ cafeId, userId, action: 'shift.end' });
  const done = await prisma.staffShift.updateMany({ where: { cafeId, userId, endedAt: null }, data: { endedAt: at } });
  return done.count > 0;
}

/** A shift left open is closed after this long (someone forgot to press "end"). */
export const SHIFT_MAX_HOURS = 16;

export async function closeStaleShifts(): Promise<number> {
  const at = now();
  const stale = await prisma.staffShift.findMany({
    where: { endedAt: null, startedAt: { lt: new Date(at.getTime() - SHIFT_MAX_HOURS * 3600_000) } },
    select: { id: true, startedAt: true },
    take: 200,
  });
  for (const s of stale) {
    await prisma.staffShift.updateMany({ where: { id: s.id, endedAt: null }, data: { endedAt: new Date(s.startedAt.getTime() + SHIFT_MAX_HOURS * 3600_000) } });
  }
  return stale.length;
}

// ------------------------------------------------------------------ view

export interface ActivityRow {
  id: string;
  at: string;
  action: string;
  actor: ActorType;
  who: string;
  shiftId: string | null;
  pcNumber: number | null;
  player: string;
  reason: string;
  minutes: number | null;
}

export interface ShiftRow {
  id: string;
  userId: string;
  who: string;
  role: 'OWNER' | 'STAFF' | 'ADMIN';
  startedAt: string;
  endedAt: string | null;
  /** Online bookings players made while this shift was on. */
  booked: number;
  arrived: number;
  noShows: number;
  cancels: number;
  walkIns: number;
}

const nameOf = (u: { nickname: string | null; fullName: string | null; name: string } | null | undefined) => (u ? (u.nickname ?? u.fullName ?? u.name) : '');

/** The arena's last activity and shifts, for owners and the site admin. */
export async function arenaActivity(cafeId: string, days = 30): Promise<{ rows: ActivityRow[]; shifts: ShiftRow[] }> {
  const since = new Date(now().getTime() - days * 86400_000);
  const [logs, shifts, members] = await Promise.all([
    prisma.auditLog.findMany({
      where: { cafeId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 1500,
      select: { id: true, createdAt: true, action: true, actorType: true, userId: true, shiftId: true, details: true },
    }),
    prisma.staffShift.findMany({
      where: { cafeId, OR: [{ startedAt: { gte: since } }, { endedAt: null }] },
      orderBy: { startedAt: 'desc' },
      take: 200,
      select: { id: true, userId: true, startedAt: true, endedAt: true, user: { select: { nickname: true, fullName: true, name: true } } },
    }),
    prisma.arenaMember.findMany({ where: { cafeId }, select: { userId: true, role: true } }),
  ]);

  // Bookings named in the log -> station and player.
  const det = (d: Prisma.JsonValue) => (d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {});
  const bookingIds = [...new Set(logs.map((l) => det(l.details).bookingId).filter((x): x is string => typeof x === 'string'))];
  const [bookings, people] = await Promise.all([
    prisma.booking.findMany({
      where: { id: { in: bookingIds } },
      select: { id: true, cancelReason: true, device: { select: { pcNumber: true } }, user: { select: { nickname: true, fullName: true, name: true } } },
    }),
    prisma.user.findMany({
      where: {
        id: {
          in: [
            ...new Set([
              ...logs.map((l) => l.userId).filter((x): x is string => !!x),
              ...logs.map((l) => det(l.details).player).filter((x): x is string => typeof x === 'string'),
            ]),
          ],
        },
      },
      select: { id: true, nickname: true, fullName: true, name: true },
    }),
  ]);
  const bookingOf = new Map(bookings.map((b) => [b.id, b]));
  const personOf = new Map(people.map((u) => [u.id, u]));

  const rows: ActivityRow[] = logs.map((l) => {
    const d = det(l.details);
    const b = typeof d.bookingId === 'string' ? bookingOf.get(d.bookingId) : undefined;
    const playerId = typeof d.player === 'string' ? d.player : null;
    return {
      id: l.id,
      at: l.createdAt.toISOString(),
      action: l.action,
      actor: l.actorType,
      who: nameOf(l.userId ? personOf.get(l.userId) : null),
      shiftId: l.shiftId,
      pcNumber: typeof d.pcNumber === 'number' ? d.pcNumber : (b?.device.pcNumber ?? null),
      player: b ? nameOf(b.user) : playerId ? nameOf(personOf.get(playerId)) : '',
      reason: typeof d.reason === 'string' ? d.reason : (l.action === 'booking.cancel' && b?.cancelReason) || '',
      minutes: typeof d.minutes === 'number' ? d.minutes : null,
    };
  });

  const roleOf = new Map(members.map((m) => [m.userId, m.role]));
  const created = rows.filter((r) => r.action === 'booking.create');
  const shiftRows: ShiftRow[] = shifts.map((s) => {
    const from = s.startedAt.getTime();
    const to = s.endedAt?.getTime() ?? Infinity;
    const mine = rows.filter((r) => r.shiftId === s.id);
    const count = (a: string) => mine.filter((r) => r.action === a).length;
    return {
      id: s.id,
      userId: s.userId,
      who: nameOf(s.user),
      role: roleOf.get(s.userId) ?? 'ADMIN',
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      booked: created.filter((r) => +new Date(r.at) >= from && +new Date(r.at) < to).length,
      arrived: count('booking.arrived'),
      noShows: count('booking.noshow'),
      cancels: count('booking.cancel'),
      walkIns: count('manage.walkIn'),
    };
  });
  return { rows, shifts: shiftRows };
}
