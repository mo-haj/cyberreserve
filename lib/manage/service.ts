// Owner panel: who may manage which arena, what the panel shows, and how each
// action changes the database. Server only. Every action is checked against
// the member's role and written to the audit log.
import { ArenaRole, BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';
import { canDo, parseLatLng, type ManageAction } from '@/lib/manage/rules';
import { arenaBookings, markByArena } from '@/lib/booking/service';
import { GROUP_SELECT } from '@/lib/cafes';
import type { GroupView } from '@/lib/groups';

export interface Membership {
  cafeId: string;
  slug: string;
  role: ArenaRole;
}

export async function getMembership(userId: string, slug: string): Promise<Membership | null> {
  const m = await prisma.arenaMember.findFirst({
    where: { userId, cafe: { slug } },
    select: { role: true, cafe: { select: { id: true, slug: true } } },
  });
  return m ? { cafeId: m.cafe.id, slug: m.cafe.slug, role: m.role } : null;
}

export async function listMyArenas(userId: string) {
  const rows = await prisma.arenaMember.findMany({
    where: { userId },
    select: { role: true, cafe: { select: { slug: true, nameAr: true, nameEn: true, coverImage: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map((r) => ({ role: r.role, ...r.cafe }));
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
  | 'bad_group';

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
  if (!canDo(member.role, input.action)) return fail('forbidden', 403);
  const at = now();
  const { cafeId } = member;

  const audit = (details: Prisma.InputJsonValue) =>
    prisma.auditLog.create({
      data: { actorType: 'OWNER', userId, action: `manage.${input.action}`, details: { arena: member.slug, ...(details as object) } },
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
