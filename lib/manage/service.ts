// Owner panel: who may manage which arena, what the panel shows, and how each
// action changes the database. Server only. Every action is checked against
// the member's role and written to the audit log.
import { ArenaRole, BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';
import { canDo, parseLatLng, type ManageAction, type NewArena } from '@/lib/manage/rules';
import { normalizePhone } from '@/lib/telegram/logic';
import { arenaBookings, markByArena } from '@/lib/booking/service';
import { GROUP_SELECT } from '@/lib/cafes';
import type { GroupView } from '@/lib/groups';

export interface Membership {
  cafeId: string;
  slug: string;
  role: ArenaRole;
  /** The site owner: may do everything, in every arena. */
  superAdmin: boolean;
}

type Who = { id: string; superAdmin: boolean };

/** What this user may do in this arena, or null (not theirs / no such arena). */
export async function getMembership(user: Who, slug: string): Promise<Membership | null> {
  if (user.superAdmin) {
    const cafe = await prisma.cafe.findUnique({ where: { slug }, select: { id: true, slug: true } });
    return cafe ? { cafeId: cafe.id, slug: cafe.slug, role: 'OWNER', superAdmin: true } : null;
  }
  const m = await prisma.arenaMember.findFirst({
    where: { userId: user.id, cafe: { slug } },
    select: { role: true, cafe: { select: { id: true, slug: true } } },
  });
  return m ? { cafeId: m.cafe.id, slug: m.cafe.slug, role: m.role, superAdmin: false } : null;
}

/** Arenas on the dashboard: their own for owners and staff, all of them for the super admin. */
export async function listMyArenas(user: Who) {
  const at = now();
  const select = {
    slug: true,
    nameAr: true,
    nameEn: true,
    coverImage: true,
    logoImage: true,
    city: true,
    isPublished: true,
    _count: { select: { devices: { where: { archivedAt: null } } } },
  } as const;
  const rows = user.superAdmin
    ? (await prisma.cafe.findMany({ select, orderBy: [{ isPublished: 'desc' }, { createdAt: 'asc' }] })).map((c) => ({
        role: 'OWNER' as ArenaRole,
        cafe: c,
      }))
    : await prisma.arenaMember.findMany({ where: { userId: user.id }, select: { role: true, cafe: { select } }, orderBy: { createdAt: 'asc' } });
  // Bookings made online for today and later, per arena (one query).
  const upcoming = await prisma.booking.groupBy({
    by: ['deviceId'],
    where: { isWalkIn: false, status: { in: HOLDING }, endTime: { gt: at }, device: { cafe: { slug: { in: rows.map((r) => r.cafe.slug) } } } },
    _count: true,
  });
  const devices = await prisma.device.findMany({
    where: { id: { in: upcoming.map((u) => u.deviceId) } },
    select: { id: true, cafe: { select: { slug: true } } },
  });
  const bySlug = new Map<string, number>();
  for (const u of upcoming) {
    const slug = devices.find((d) => d.id === u.deviceId)?.cafe.slug;
    if (slug) bySlug.set(slug, (bySlug.get(slug) ?? 0) + u._count);
  }
  return rows.map(({ role, cafe: { _count, ...c } }) => ({ role, ...c, stations: _count.devices, upcoming: bySlug.get(c.slug) ?? 0 }));
}

/** Super admin: a new, hidden arena (owners and stations are added on its page). */
export async function createArena(input: NewArena, userId: string): Promise<{ ok: true; slug: string } | { ok: false; error: 'slug_taken' }> {
  const taken = await prisma.cafe.findUnique({ where: { slug: input.slug }, select: { id: true } });
  if (taken) return { ok: false, error: 'slug_taken' };
  const rate = new Prisma.Decimal(input.hourlyRate);
  await prisma.cafe.create({
    data: {
      slug: input.slug,
      nameAr: input.nameAr,
      nameEn: input.nameEn,
      city: input.city,
      areaAr: input.areaAr,
      areaEn: input.areaEn,
      addressAr: '',
      addressEn: '',
      taglineAr: '',
      taglineEn: '',
      hoursAr: '',
      hoursEn: '',
      hourlyRate: rate,
      nightShiftRate: rate,
      coverImage: '/cafes/cover-default.svg',
      isPublished: false,
    },
  });
  await prisma.auditLog.create({ data: { actorType: 'ADMIN', userId, action: 'admin.arena.create', details: { arena: input.slug } } });
  return { ok: true, slug: input.slug };
}

const HOLDING: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

export interface ManageStation {
  pcNumber: number;
  type: 'PC' | 'PS5' | 'PS4' | 'XBOX';
  label: string;
  specs: string;
  groupId: string;
  hourlyRate: string;
  nightRate: string;
  isMaintenance: boolean;
  /** Current booking or walk-in, if any. */
  busy: { until: string; walkIn: boolean } | null;
}

export interface ManagePlayer {
  id: string;
  fullName: string;
  nickname: string;
  phone: string;
  city: string;
  bookings: number;
  noShows: number;
  last: string;
}

/** Players who booked online at this arena, most recent first (up to 300). */
async function arenaPlayers(cafeId: string): Promise<ManagePlayer[]> {
  const rows = await prisma.booking.groupBy({
    by: ['userId', 'status'],
    where: { isWalkIn: false, userId: { not: null }, device: { cafeId } },
    _count: true,
    _max: { startTime: true },
  });
  const per = new Map<string, { bookings: number; noShows: number; last: Date }>();
  for (const r of rows) {
    const p = per.get(r.userId!) ?? { bookings: 0, noShows: 0, last: new Date(0) };
    p.bookings += r._count;
    if (r.status === BookingStatus.NO_SHOW) p.noShows += r._count;
    if (r._max.startTime && r._max.startTime > p.last) p.last = r._max.startTime;
    per.set(r.userId!, p);
  }
  const ids = [...per.entries()].sort((a, b) => +b[1].last - +a[1].last).slice(0, 300).map(([id]) => id);
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, fullName: true, nickname: true, phone: true, homeCity: true },
  });
  return ids.flatMap((id) => {
    const u = users.find((x) => x.id === id);
    const p = per.get(id)!;
    return u
      ? [{ id, fullName: u.fullName ?? u.name, nickname: u.nickname ?? '', phone: u.phone ?? '', city: u.homeCity ?? '', bookings: p.bookings, noShows: p.noShows, last: p.last.toISOString() }]
      : [];
  });
}

export async function getManageData(cafeId: string) {
  const at = now();
  const cafe = await prisma.cafe.findUniqueOrThrow({
    where: { id: cafeId },
    include: {
      devices: {
        where: { archivedAt: null },
        orderBy: { pcNumber: 'asc' },
        include: {
          bookings: {
            where: { status: { in: HOLDING }, startTime: { lte: at }, endTime: { gt: at } },
            select: { endTime: true, isWalkIn: true },
            take: 1,
          },
        },
      },
      games: { select: { game: { select: { slug: true } } } },
      stationGroups: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: GROUP_SELECT },
      sections: { orderBy: { position: 'asc' }, select: { id: true, titleAr: true, titleEn: true, bodyAr: true, bodyEn: true, imageUrl: true } },
      members: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, user: { select: { id: true, name: true, nickname: true, fullName: true, phone: true } } },
      },
    },
  });
  const catalogue = await prisma.game.findMany({
    select: { slug: true, name: true, genreEn: true, genreAr: true, imageUrl: true },
    orderBy: { name: 'asc' },
  });
  const stations: ManageStation[] = cafe.devices.map((d) => ({
    pcNumber: d.pcNumber,
    type: d.type,
    label: d.label ?? '',
    specs: d.specs ?? '',
    groupId: d.groupId ?? '',
    hourlyRate: d.hourlyRate ? d.hourlyRate.toFixed(0) : '',
    nightRate: d.nightRate ? d.nightRate.toFixed(0) : '',
    isMaintenance: d.isMaintenance,
    busy: d.bookings[0] ? { until: d.bookings[0].endTime.toISOString(), walkIn: d.bookings[0].isWalkIn } : null,
  }));
  return {
    at: at.toISOString(),
    bookings: await arenaBookings(cafeId),
    arena: {
      slug: cafe.slug,
      nameAr: cafe.nameAr,
      nameEn: cafe.nameEn,
      taglineAr: cafe.taglineAr,
      taglineEn: cafe.taglineEn,
      city: cafe.city,
      areaAr: cafe.areaAr,
      areaEn: cafe.areaEn,
      addressAr: cafe.addressAr,
      addressEn: cafe.addressEn,
      hoursAr: cafe.hoursAr,
      hoursEn: cafe.hoursEn,
      hourlyRate: cafe.hourlyRate.toFixed(0),
      nightShiftRate: cafe.nightShiftRate.toFixed(0),
      location: cafe.latitude != null && cafe.longitude != null ? `${cafe.latitude}, ${cafe.longitude}` : '',
    },
    images: { logo: cafe.logoImage, cover: cafe.coverImage },
    stations,
    groups: cafe.stationGroups.map(
      (g): ManageGroup => ({ ...g, stations: stations.filter((s) => s.groupId === g.id).map((s) => s.pcNumber) }),
    ),
    games: { selected: cafe.games.map((g) => g.game.slug), catalogue },
    isPublished: cafe.isPublished,
    posts: cafe.sections,
    players: await arenaPlayers(cafeId),
    members: cafe.members.map((m) => ({
      userId: m.user.id,
      role: m.role,
      name: m.user.nickname ?? m.user.fullName ?? m.user.name,
      phone: m.user.phone ?? '',
    })),
  };
}
export interface ManageGroup extends GroupView {
  /** Station numbers in this zone. */
  stations: number[];
}

export type ManageData = Awaited<ReturnType<typeof getManageData>>;

export type ActionResult = { ok: true } | { ok: false; error: ActionError; status: number };
export type ActionError =
  | 'forbidden'
  | 'not_found'
  | 'busy'
  | 'not_busy'
  | 'has_bookings'
  | 'bad_location'
  | 'too_many'
  | 'too_late'
  | 'bad_group'
  | 'empty_post'
  | 'bad_phone'
  | 'no_such_player';

const fail = (error: ActionError, status = 400): ActionResult => ({ ok: false, error, status });
const priceOrNull = (v: string | undefined) => (v ? new Prisma.Decimal(v) : null);

/** A zone of this arena whose type matches, or null. '' / undefined pass through. */
async function checkGroup(cafeId: string, groupId: string | undefined, type: string): Promise<boolean> {
  if (!groupId) return true;
  const g = await prisma.stationGroup.findFirst({ where: { id: groupId, cafeId }, select: { type: true } });
  return !!g && g.type === type;
}

const groupLink = (groupId: string | undefined) => (groupId === undefined ? {} : { groupId: groupId || null });

async function station(cafeId: string, pcNumber: number) {
  return prisma.device.findFirst({ where: { cafeId, pcNumber, archivedAt: null } });
}

export async function runAction(
  member: Membership,
  userId: string,
  input: ManageAction,
): Promise<ActionResult> {
  if (!canDo(member.role, input.action, member.superAdmin)) return fail('forbidden', 403);
  const at = now();
  const { cafeId } = member;

  const audit = (details: Prisma.InputJsonValue) =>
    prisma.auditLog.create({
      data: { actorType: member.superAdmin ? 'ADMIN' : 'OWNER', userId, action: `manage.${input.action}`, details: { arena: member.slug, ...(details as object) } },
    });

  switch (input.action) {
    case 'walkIn': {
      const d = await station(cafeId, input.pcNumber);
      if (!d) return fail('not_found', 404);
      try {
        await prisma.booking.create({
          data: {
            deviceId: d.id,
            isWalkIn: true,
            startTime: at,
            endTime: new Date(at.getTime() + input.minutes * 60_000),
            totalPrice: new Prisma.Decimal(0),
            status: BookingStatus.CONFIRMED,
            confirmedAt: at,
          },
        });
      } catch (err) {
        // no_overlap_booking: someone already holds this station now.
        if (err instanceof Prisma.PrismaClientUnknownRequestError || err instanceof Prisma.PrismaClientKnownRequestError) {
          if (String(err.message).includes('no_overlap_booking') || String(err.message).includes('23P01')) return fail('busy', 409);
        }
        throw err;
      }
      await audit({ pcNumber: input.pcNumber, minutes: input.minutes });
      return { ok: true };
    }
    case 'freeNow': {
      const d = await station(cafeId, input.pcNumber);
      if (!d) return fail('not_found', 404);
      // End whatever holds the station right now (walk-in or online booking).
      const ended = await prisma.booking.updateMany({
        where: { deviceId: d.id, status: { in: HOLDING }, startTime: { lte: at }, endTime: { gt: at } },
        data: { endTime: at, actualEnd: at, status: BookingStatus.COMPLETED },
      });
      if (ended.count === 0) return fail('not_busy', 409);
      await audit({ pcNumber: input.pcNumber });
      return { ok: true };
    }
    case 'markBooking': {
      const r = await markByArena(userId, input.bookingId, input.mark);
      if (!r.ok) return fail(r.error === 'not_allowed' ? 'forbidden' : 'too_late', r.error === 'not_allowed' ? 403 : 409);
      return { ok: true };
    }
    case 'maintenance': {
      const done = await prisma.device.updateMany({
        where: { cafeId, pcNumber: input.pcNumber, archivedAt: null },
        data: { isMaintenance: input.on },
      });
      if (done.count === 0) return fail('not_found', 404);
      await audit({ pcNumber: input.pcNumber, on: input.on });
      return { ok: true };
    }
    case 'addStations': {
      if (!(await checkGroup(cafeId, input.groupId, input.type))) return fail('bad_group');
      const total = await prisma.device.count({ where: { cafeId, archivedAt: null } });
      if (total + input.count > 200) return fail('too_many');
      // New numbers continue after the highest ever used (removed ones included).
      const max = await prisma.device.aggregate({ where: { cafeId }, _max: { pcNumber: true } });
      const first = (max._max.pcNumber ?? 0) + 1;
      await prisma.device.createMany({
        data: Array.from({ length: input.count }, (_, i) => ({
          cafeId,
          pcNumber: first + i,
          type: input.type,
          label: input.label || null,
          specs: input.specs || null,
          groupId: input.groupId || null,
          hourlyRate: priceOrNull(input.hourlyRate),
          nightRate: priceOrNull(input.nightRate),
        })),
      });
      await audit({ type: input.type, count: input.count, first });
      return { ok: true };
    }
    case 'editStation': {
      if (!(await checkGroup(cafeId, input.groupId, input.type))) return fail('bad_group');
      const before = await station(cafeId, input.pcNumber);
      if (!before) return fail('not_found', 404);
      // A station that changes type leaves a zone of the old type.
      const leaveGroup = input.groupId === undefined && before.type !== input.type ? { groupId: null } : {};
      const done = await prisma.device.updateMany({
        where: { cafeId, pcNumber: input.pcNumber, archivedAt: null },
        data: {
          type: input.type,
          label: input.label || null,
          ...(input.specs === undefined ? {} : { specs: input.specs || null }),
          ...leaveGroup,
          ...groupLink(input.groupId),
          hourlyRate: priceOrNull(input.hourlyRate),
          nightRate: priceOrNull(input.nightRate),
        },
      });
      if (done.count === 0) return fail('not_found', 404);
      await audit({ pcNumber: input.pcNumber });
      return { ok: true };
    }
    case 'removeStation': {
      const d = await station(cafeId, input.pcNumber);
      if (!d) return fail('not_found', 404);
      // Never strand a player: refuse while online bookings are still to come.
      const upcoming = await prisma.booking.count({
        where: { deviceId: d.id, isWalkIn: false, status: { in: HOLDING }, endTime: { gt: at } },
      });
      if (upcoming > 0) return fail('has_bookings', 409);
      await prisma.$transaction([
        prisma.booking.updateMany({
          where: { deviceId: d.id, isWalkIn: true, status: { in: HOLDING }, endTime: { gt: at } },
          data: { endTime: at, status: BookingStatus.COMPLETED },
        }),
        prisma.device.update({ where: { id: d.id }, data: { archivedAt: at } }),
      ]);
      await audit({ pcNumber: input.pcNumber });
      return { ok: true };
    }
    case 'editArena': {
      let pin: { lat: number; lng: number } | null = null;
      if (input.location) {
        pin = parseLatLng(input.location);
        if (!pin) return fail('bad_location');
      }
      await prisma.cafe.update({
        where: { id: cafeId },
        data: {
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          taglineAr: input.taglineAr,
          taglineEn: input.taglineEn,
          city: input.city,
          areaAr: input.areaAr,
          areaEn: input.areaEn,
          addressAr: input.addressAr,
          addressEn: input.addressEn,
          hoursAr: input.hoursAr,
          hoursEn: input.hoursEn,
          hourlyRate: new Prisma.Decimal(input.hourlyRate),
          nightShiftRate: new Prisma.Decimal(input.nightShiftRate),
          latitude: pin?.lat ?? null,
          longitude: pin?.lng ?? null,
        },
      });
      await audit({ fields: 'arena' });
      return { ok: true };
    }
    case 'saveGroup': {
      const { action: _a, id, stations: numbers, ...fields } = input;
      void _a;
      let groupId = id;
      if (id) {
        const g = await prisma.stationGroup.findFirst({ where: { id, cafeId }, select: { id: true } });
        if (!g) return fail('not_found', 404);
      }
      await prisma.$transaction(async (tx) => {
        if (groupId) {
          await tx.stationGroup.update({ where: { id: groupId }, data: fields });
        } else {
          const last = await tx.stationGroup.aggregate({ where: { cafeId }, _max: { position: true } });
          const g = await tx.stationGroup.create({ data: { cafeId, position: (last._max.position ?? 0) + 1, ...fields }, select: { id: true } });
          groupId = g.id;
        }
        // Exactly the chosen stations of this type are in the zone.
        await tx.device.updateMany({ where: { cafeId, groupId, pcNumber: { notIn: numbers } }, data: { groupId: null } });
        await tx.device.updateMany({
          where: { cafeId, archivedAt: null, type: fields.type, pcNumber: { in: numbers } },
          data: { groupId },
        });
        // Stations of another type can't stay in it (the type may have changed).
        await tx.device.updateMany({ where: { cafeId, groupId, type: { not: fields.type } }, data: { groupId: null } });
      });
      await audit({ group: groupId, stations: numbers.length, created: !id });
      return { ok: true };
    }
    case 'removeGroup': {
      const g = await prisma.stationGroup.findFirst({ where: { id: input.id, cafeId }, select: { id: true } });
      if (!g) return fail('not_found', 404);
      // Stations stay; they just leave the zone (ON DELETE SET NULL).
      await prisma.$transaction([
        prisma.arenaImage.deleteMany({ where: { cafeId, kind: `group:${g.id}` } }),
        prisma.stationGroup.delete({ where: { id: g.id } }),
      ]);
      await audit({ group: g.id });
      return { ok: true };
    }
    case 'moveGroup': {
      const list = await prisma.stationGroup.findMany({
        where: { cafeId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      const i = list.findIndex((g) => g.id === input.id);
      if (i < 0) return fail('not_found', 404);
      const j = i + input.by;
      if (j < 0 || j >= list.length) return { ok: true };
      [list[i], list[j]] = [list[j], list[i]];
      await prisma.$transaction(list.map((g, k) => prisma.stationGroup.update({ where: { id: g.id }, data: { position: k + 1 } })));
      return { ok: true };
    }
    case 'savePost': {
      const { action: _a, id, ...text } = input;
      void _a;
      if (!text.titleAr && !text.titleEn && !text.bodyAr && !text.bodyEn) return fail('empty_post');
      if (id) {
        const done = await prisma.cafeSection.updateMany({ where: { id, cafeId }, data: text });
        if (done.count === 0) return fail('not_found', 404);
      } else {
        const last = await prisma.cafeSection.aggregate({ where: { cafeId }, _max: { position: true } });
        await prisma.cafeSection.create({ data: { cafeId, position: (last._max.position ?? 0) + 1, imageUrl: '', ...text } });
      }
      await audit({ post: id ?? 'new' });
      return { ok: true };
    }
    case 'removePost': {
      const post = await prisma.cafeSection.findFirst({ where: { id: input.id, cafeId }, select: { id: true } });
      if (!post) return fail('not_found', 404);
      await prisma.$transaction([
        prisma.arenaImage.deleteMany({ where: { cafeId, kind: `post:${post.id}` } }),
        prisma.cafeSection.delete({ where: { id: post.id } }),
      ]);
      await audit({ post: post.id, removed: true });
      return { ok: true };
    }
    case 'movePost': {
      const list = await prisma.cafeSection.findMany({ where: { cafeId }, orderBy: { position: 'asc' }, select: { id: true } });
      const i = list.findIndex((p) => p.id === input.id);
      if (i < 0) return fail('not_found', 404);
      const j = i + input.by;
      if (j < 0 || j >= list.length) return { ok: true };
      [list[i], list[j]] = [list[j], list[i]];
      // Positions are unique per arena: park them out of the way first.
      await prisma.$transaction([
        ...list.map((p, k) => prisma.cafeSection.update({ where: { id: p.id }, data: { position: -(k + 1) } })),
        ...list.map((p, k) => prisma.cafeSection.update({ where: { id: p.id }, data: { position: k + 1 } })),
      ]);
      return { ok: true };
    }
    case 'setPublished': {
      await prisma.cafe.update({ where: { id: cafeId }, data: { isPublished: input.on } });
      await audit({ published: input.on });
      return { ok: true };
    }
    case 'setMember': {
      const phone = normalizePhone(input.phone);
      if (!phone) return fail('bad_phone');
      const who = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
      // They must have signed in once with Telegram (that is how the phone is known).
      if (!who) return fail('no_such_player', 404);
      await prisma.arenaMember.upsert({
        where: { cafeId_userId: { cafeId, userId: who.id } },
        update: { role: input.role },
        create: { cafeId, userId: who.id, role: input.role },
      });
      await audit({ member: who.id, role: input.role });
      return { ok: true };
    }
    case 'removeMember': {
      await prisma.arenaMember.deleteMany({ where: { cafeId, userId: input.userId } });
      await audit({ member: input.userId, removed: true });
      return { ok: true };
    }
    case 'setGames': {
      const games = await prisma.game.findMany({ where: { slug: { in: input.slugs } }, select: { id: true } });
      await prisma.$transaction([
        prisma.cafeGame.deleteMany({ where: { cafeId } }),
        prisma.cafeGame.createMany({ data: games.map((g) => ({ cafeId, gameId: g.id })) }),
      ]);
      await audit({ count: games.length });
      return { ok: true };
    }
  }
}
