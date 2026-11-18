// Seed script. Runs on EVERY container start, so it must be fully idempotent:
// upsert everywhere, never plain create.
//
// - Demo cafes (prisma/demo-data.ts) are created once, like real ones. After
//   that the arena owner panel (/manage) owns them: edits there are kept
//   across restarts. Missing demo stations, sections and games are added.
// - Real cafes, pricing and snack items are created once and then left alone
//   (`update: {}`), so owner edits are never overwritten.
// - Demo bookings (red PCs on the live grid) are refreshed around the current
//   time unless SEED_DEMO_BOOKINGS=false.

import { Prisma, PrismaClient } from '@prisma/client';
import { DEMO_CAFES, demoGroups, demoStations } from './demo-data';
import { DEMO_ARENA_GAMES, GAMES, GENRES } from './games-data';

const prisma = new PrismaClient();

// DEPRECATED singleton, kept until Phase 1 (see schema.prisma).
const DEFAULT_PRICING = {
  hourlyRate: new Prisma.Decimal('100.00'),
  nightShiftRate: new Prisma.Decimal('80.00'),
  currency: 'SYP',
};

const SNACKS: { id: string; name: string; price: string }[] = [
  { id: 'snack-water', name: 'Water / ماء', price: '10.00' },
  { id: 'snack-soft-drink', name: 'Soft drink / مشروب غازي', price: '30.00' },
  { id: 'snack-energy-drink', name: 'Energy drink / مشروب طاقة', price: '80.00' },
  { id: 'snack-coffee', name: 'Coffee / قهوة', price: '25.00' },
  { id: 'snack-chips', name: 'Chips / شيبس', price: '20.00' },
  { id: 'snack-noodles', name: 'Instant noodles / اندومي', price: '40.00' },
];

// Demo bookings run from 30 minutes ago to 6 hours from now.
const DEMO_BOOKING_BEFORE_MS = 30 * 60_000;
const DEMO_BOOKING_AFTER_MS = 6 * 60 * 60_000;

async function seedDemoCafes() {
  for (const d of DEMO_CAFES) {
    const content = {
      slug: d.slug,
      nameEn: d.nameEn,
      nameAr: d.nameAr,
      city: d.city,
      areaEn: d.areaEn,
      areaAr: d.areaAr,
      addressEn: d.addressEn,
      addressAr: d.addressAr,
      latitude: d.latitude,
      longitude: d.longitude,
      taglineEn: d.taglineEn,
      taglineAr: d.taglineAr,
      hoursEn: d.hoursEn,
      hoursAr: d.hoursAr,
      hourlyRate: new Prisma.Decimal(d.hourlyRate),
      nightShiftRate: new Prisma.Decimal(d.nightShiftRate),
      coverImage: d.coverImage,
      isDemo: true,
    };
    await prisma.cafe.upsert({
      where: { id: d.id },
      update: {},
      create: { id: d.id, ...content },
    });

    for (const [i, s] of d.sections.entries()) {
      await prisma.cafeSection.upsert({
        where: { cafeId_position: { cafeId: d.id, position: i + 1 } },
        update: {},
        create: { cafeId: d.id, position: i + 1, ...s },
      });
    }

    for (const st of demoStations(d)) {
      const station = {
        type: st.type,
        staticIp: st.staticIp,
        specs: st.specs,
        label: st.label,
        hourlyRate: st.hourlyRate ? new Prisma.Decimal(st.hourlyRate) : null,
        nightRate: st.nightRate ? new Prisma.Decimal(st.nightRate) : null,
        isMaintenance: d.maintenance.includes(st.pcNumber),
      };
      await prisma.device.upsert({
        where: { cafeId_pcNumber: { cafeId: d.id, pcNumber: st.pcNumber } },
        update: {},
        create: { cafeId: d.id, pcNumber: st.pcNumber, ...station },
      });
    }
  }
}

/**
 * Zones (spec cards) of each demo arena. Only for an arena with no zones yet:
 * after that the owner panel owns them. Stations join the zone whose spec
 * text they were created with, unless they already have one.
 */
async function seedDemoGroups() {
  for (const d of DEMO_CAFES) {
    if ((await prisma.stationGroup.count({ where: { cafeId: d.id } })) > 0) continue;
    const stations = demoStations(d);
    for (const [i, g] of demoGroups(d).entries()) {
      const group = await prisma.stationGroup.create({ data: { cafeId: d.id, position: i + 1, ...g.fields }, select: { id: true } });
      const numbers = stations.filter((s) => s.specs === g.match).map((s) => s.pcNumber);
      await prisma.device.updateMany({
        where: { cafeId: d.id, pcNumber: { in: numbers }, groupId: null, type: g.fields.type },
        data: { groupId: group.id },
      });
    }
  }
}

/** Game catalogue (upsert by slug) and the games each demo arena offers. */
async function seedGames() {
  for (const g of GAMES) {
    const data = { name: g.name, genreEn: GENRES[g.genre].en, genreAr: GENRES[g.genre].ar };
    // imageUrl is never overwritten: an owner may have added a cover.
    await prisma.game.upsert({ where: { slug: g.slug }, update: data, create: { slug: g.slug, ...data } });
  }
  const ids = new Map((await prisma.game.findMany({ select: { id: true, slug: true } })).map((g) => [g.slug, g.id]));
  for (const d of DEMO_CAFES) {
    // Only for a demo arena that has no games yet: later choices in the
    // owner panel (including removing games) are kept.
    if ((await prisma.cafeGame.count({ where: { cafeId: d.id } })) > 0) continue;
    const slugs = DEMO_ARENA_GAMES[d.slug] ?? [];
    await prisma.cafeGame.createMany({
      data: slugs.flatMap((slug) => (ids.has(slug) ? [{ cafeId: d.id, gameId: ids.get(slug)! }] : [])),
      skipDuplicates: true,
    });
  }
}

async function seedDemoBookings(): Promise<number> {
  const at = Date.now();
  const startTime = new Date(at - DEMO_BOOKING_BEFORE_MS);
  const endTime = new Date(at + DEMO_BOOKING_AFTER_MS);
  let made = 0;

  for (const d of DEMO_CAFES) {
    for (const n of d.demoBusy) {
      const device = await prisma.device.findUnique({
        where: { cafeId_pcNumber: { cafeId: d.id, pcNumber: n } },
        select: { id: true },
      });
      if (!device) continue;
      const id = `demo-${d.slug}-pc-${n}`;
      const data = {
        deviceId: device.id,
        isWalkIn: true,
        startTime,
        endTime,
        totalPrice: new Prisma.Decimal('0.00'),
        status: 'CONFIRMED' as const,
        snackNotes: 'Demo booking created by the seed script',
      };
      try {
        await prisma.booking.upsert({ where: { id }, update: data, create: { id, ...data } });
        made += 1;
      } catch (err) {
        // A real booking already holds this PC (no_overlap_booking). Real
        // bookings always win; skip the demo one.
        console.warn(`[seed] demo booking ${id} skipped: ${err instanceof Error ? err.message.split('\n').pop() : err}`);
      }
    }
  }
  return made;
}

async function main() {
  await seedDemoCafes();
  await seedDemoGroups();
  await seedGames();

  const demoBookings =
    process.env.SEED_DEMO_BOOKINGS === 'false' ? 0 : await seedDemoBookings();

  await prisma.pricingSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', ...DEFAULT_PRICING },
  });

  for (const snack of SNACKS) {
    await prisma.snackItem.upsert({
      where: { id: snack.id },
      update: {},
      create: { id: snack.id, name: snack.name, price: new Prisma.Decimal(snack.price) },
    });
  }

  const [cafes, devices, snacks] = await Promise.all([
    prisma.cafe.count(),
    prisma.device.count(),
    prisma.snackItem.count(),
  ]);
  console.log(
    `[seed] ok — cafes=${cafes} devices=${devices} demoBookings=${demoBookings} snacks=${snacks} pricing=default`,
  );
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
