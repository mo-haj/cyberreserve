// Read-side data access for the public cafe pages and their live status.
// Pages and API routes go through these functions only.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { BookingStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { now } from '@/lib/time';
import { isPreview } from '@/lib/preview';
import {
  countByType,
  countStatuses,
  derivePcViews,
  type StationType,
  type BookingInput,
  type DeviceInput,
  type PcView,
  type StatusCounts,
} from '@/lib/availability';
import { groupSummary, type GroupView } from '@/lib/groups';
import { DEMO_CAFES, demoGroups, demoStations } from '@/prisma/demo-data';
import { DEMO_ARENA_GAMES, GAMES, GENRES } from '@/prisma/games-data';

export interface GameView {
  slug: string;
  name: string;
  genreEn: string;
  genreAr: string;
  imageUrl: string | null;
}

export interface CafeSummary {
  slug: string;
  nameEn: string;
  nameAr: string;
  /** Key from lib/cities.ts. */
  city: string;
  areaEn: string;
  areaAr: string;
  taglineEn: string;
  taglineAr: string;
  hourlyRate: string;
  currency: string;
  coverImage: string;
  /** Uploaded logo, or null. */
  logoImage: string | null;
  isDemo: boolean;
  counts: StatusCounts;
  /** Games this arena offers, A to Z. */
  games: GameView[];
  /** Stations per type (PC, PS5...), with how many are free. */
  types: { type: StationType; total: number; free: number }[];
}

export interface CafeSectionView {
  titleEn: string;
  titleAr: string;
  bodyEn: string;
  bodyAr: string;
  imageUrl: string;
}

export interface CafeDetail extends CafeSummary {
  addressEn: string;
  addressAr: string;
  latitude: number | null;
  longitude: number | null;
  hoursEn: string;
  hoursAr: string;
  nightShiftRate: string;
  sections: CafeSectionView[];
  /** Zones with their hardware, in the owner's order. */
  groups: GroupView[];
  pcs: PcView[];
}

export interface CafeLive {
  slug: string;
  at: string;
  counts: StatusCounts;
  pcs: PcView[];
}

const HOLDING: BookingStatus[] = [BookingStatus.PENDING, BookingStatus.CONFIRMED];

// Preview mode (PREVIEW_MODE=1, see lib/preview.ts) serves the demo cafes from
// prisma/demo-data.ts without a database. Never set it in production.
const useFixture = isPreview;

// ---------------------------------------------------------------- database

function deviceQuery(at: Date) {
  return {
    // Stations removed by the arena are kept for old bookings but never shown.
    where: { archivedAt: null },
    select: {
      id: true,
      pcNumber: true,
      isMaintenance: true,
      specs: true,
      groupId: true,
      group: { select: { type: true, gpu: true, ram: true, screen: true, refreshHz: true } },
      type: true,
      label: true,
      hourlyRate: true,
      nightRate: true,
      bookings: {
        where: { status: { in: HOLDING }, startTime: { lte: at }, endTime: { gt: at } },
        select: { deviceId: true, startTime: true, endTime: true, status: true },
      },
    },
  } as const;
}

type DeviceRow = Omit<DeviceInput, 'hourlyRate' | 'nightRate'> & {
  group: Parameters<typeof groupSummary>[0] | null;
  hourlyRate: Prisma.Decimal | null;
  nightRate: Prisma.Decimal | null;
  bookings: BookingInput[];
};

interface CafeRates {
  hourlyRate: Prisma.Decimal;
  nightShiftRate: Prisma.Decimal;
}

export const GROUP_SELECT = {
  id: true,
  type: true,
  nameAr: true,
  nameEn: true,
  noteAr: true,
  noteEn: true,
  isVip: true,
  imageUrl: true,
  cpu: true,
  gpu: true,
  ram: true,
  storage: true,
  screen: true,
  refreshHz: true,
  controllers: true,
  keyboard: true,
  mouse: true,
  headset: true,
  chair: true,
} as const;

const gamesQuery = {
  select: { game: { select: { slug: true, name: true, genreEn: true, genreAr: true, imageUrl: true } } },
} as const;

// A cover saved as public/games/<slug>.webp (or .jpg/.png) is used when the
// database has no imageUrl. Served from our own server: fast, cached, and not
// blocked the way some foreign image hosts are in Syria.
const COVER_DIR = path.join(process.cwd(), 'public', 'games');
const coverCache = new Map<string, string | null>();
function localCover(slug: string): string | null {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  if (!coverCache.has(slug)) {
    const ext = ['webp', 'jpg', 'png'].find((e) => existsSync(path.join(COVER_DIR, `${slug}.${e}`)));
    coverCache.set(slug, ext ? `/games/${slug}.${ext}` : null);
  }
  return coverCache.get(slug)!;
}

function withCover(g: GameView): GameView {
  return g.imageUrl ? g : { ...g, imageUrl: localCover(g.slug) };
}

function gamesFrom(rows: { game: GameView }[]): GameView[] {
  return rows.map((r) => withCover(r.game)).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

/** A station's own price, or the arena's when it has none. */
function viewsFrom(devices: DeviceRow[], cafe: CafeRates, at: Date): PcView[] {
  return derivePcViews(
    devices.map(({ group, ...d }) => ({
      ...d,
      // The group's hardware wins; the old one-line specs are the fallback.
      specs: (group && groupSummary(group)) || d.specs,
      hourlyRate: (d.hourlyRate ?? cafe.hourlyRate).toFixed(0),
      nightRate: (d.nightRate ?? cafe.nightShiftRate).toFixed(0),
    })),
    devices.flatMap((d) => d.bookings),
    at,
  );
}

export async function listCafes(): Promise<CafeSummary[]> {
  if (useFixture()) return fixtureCafes().map(toSummary);
  const at = now();
  const cafes = await prisma.cafe.findMany({
    where: { isPublished: true },
    orderBy: [{ isDemo: 'asc' }, { createdAt: 'asc' }, { slug: 'asc' }],
    include: { devices: deviceQuery(at), games: gamesQuery },
  });
  return cafes.map((c) => {
    const pcs = viewsFrom(c.devices, c, at);
    return {
      slug: c.slug,
      nameEn: c.nameEn,
      nameAr: c.nameAr,
      city: c.city,
      areaEn: c.areaEn,
      areaAr: c.areaAr,
      taglineEn: c.taglineEn,
      taglineAr: c.taglineAr,
      hourlyRate: c.hourlyRate.toFixed(0),
      currency: c.currency,
      coverImage: c.coverImage,
      logoImage: c.logoImage,
      isDemo: c.isDemo,
      counts: countStatuses(pcs),
      games: gamesFrom(c.games),
      types: countByType(pcs),
    };
  });
}

export async function getCafe(slug: string): Promise<CafeDetail | null> {
  if (useFixture()) return fixtureCafes().find((c) => c.slug === slug) ?? null;
  const at = now();
  const c = await prisma.cafe.findFirst({
    where: { slug, isPublished: true },
    include: {
      devices: deviceQuery(at),
      sections: { orderBy: { position: 'asc' } },
      games: gamesQuery,
      stationGroups: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], select: GROUP_SELECT },
    },
  });
  if (!c) return null;
  const pcs = viewsFrom(c.devices, c, at);
  return {
    slug: c.slug,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    city: c.city,
    areaEn: c.areaEn,
    areaAr: c.areaAr,
    taglineEn: c.taglineEn,
    taglineAr: c.taglineAr,
    hourlyRate: c.hourlyRate.toFixed(0),
    nightShiftRate: c.nightShiftRate.toFixed(0),
    currency: c.currency,
    coverImage: c.coverImage,
    logoImage: c.logoImage,
    isDemo: c.isDemo,
    addressEn: c.addressEn,
    addressAr: c.addressAr,
    latitude: c.latitude,
    longitude: c.longitude,
    hoursEn: c.hoursEn,
    hoursAr: c.hoursAr,
    sections: c.sections.map((s) => ({
      titleEn: s.titleEn,
      titleAr: s.titleAr,
      bodyEn: s.bodyEn,
      bodyAr: s.bodyAr,
      imageUrl: s.imageUrl,
    })),
    groups: c.stationGroups,
    pcs,
    counts: countStatuses(pcs),
    games: gamesFrom(c.games),
    types: countByType(pcs),
  };
}

export async function getCafeLive(slug: string): Promise<CafeLive | null> {
  if (useFixture()) {
    const c = fixtureCafes().find((x) => x.slug === slug);
    return c ? { slug, at: now().toISOString(), counts: c.counts, pcs: c.pcs } : null;
  }
  const at = now();
  const c = await prisma.cafe.findFirst({
    where: { slug, isPublished: true },
    select: { slug: true, hourlyRate: true, nightShiftRate: true, devices: deviceQuery(at) },
  });
  if (!c) return null;
  const pcs = viewsFrom(c.devices, c, at);
  return { slug: c.slug, at: at.toISOString(), counts: countStatuses(pcs), pcs };
}

// ---------------------------------------------------------------- fixture

function toSummary(c: CafeDetail): CafeSummary {
  return {
    slug: c.slug,
    nameEn: c.nameEn,
    nameAr: c.nameAr,
    city: c.city,
    areaEn: c.areaEn,
    areaAr: c.areaAr,
    taglineEn: c.taglineEn,
    taglineAr: c.taglineAr,
    hourlyRate: c.hourlyRate,
    currency: c.currency,
    coverImage: c.coverImage,
    logoImage: c.logoImage,
    isDemo: c.isDemo,
    counts: c.counts,
    games: c.games,
    types: c.types,
  };
}

function fixtureCafes(): CafeDetail[] {
  const at = now();
  const start = new Date(at.getTime() - 30 * 60_000);
  const end = new Date(at.getTime() + 90 * 60_000);
  return DEMO_CAFES.map((d) => {
    const groups: GroupView[] = demoGroups(d).map((g, i) => ({ id: `${d.id}-g${i}`, ...g.fields }));
    const groupOf = (specs: string | null) => {
      const i = demoGroups(d).findIndex((g) => g.match === specs);
      return i >= 0 ? groups[i] : null;
    };
    const devices: DeviceInput[] = demoStations(d).map((st) => ({
      id: `${d.id}-pc-${st.pcNumber}`,
      pcNumber: st.pcNumber,
      isMaintenance: d.maintenance.includes(st.pcNumber),
      specs: (groupOf(st.specs) && groupSummary(groupOf(st.specs)!)) || st.specs,
      groupId: groupOf(st.specs)?.id ?? null,
      type: st.type,
      label: st.label,
      hourlyRate: Number(st.hourlyRate ?? d.hourlyRate).toFixed(0),
      nightRate: Number(st.nightRate ?? d.nightShiftRate).toFixed(0),
    }));
    const bookings: BookingInput[] = d.demoBusy.map((n) => ({
      deviceId: `${d.id}-pc-${n}`,
      startTime: start,
      endTime: end,
      status: 'CONFIRMED',
    }));
    const pcs = derivePcViews(devices, bookings, at);
    return {
      slug: d.slug,
      nameEn: d.nameEn,
      nameAr: d.nameAr,
      city: d.city,
      areaEn: d.areaEn,
      areaAr: d.areaAr,
      taglineEn: d.taglineEn,
      taglineAr: d.taglineAr,
      hourlyRate: Number(d.hourlyRate).toFixed(0),
      nightShiftRate: Number(d.nightShiftRate).toFixed(0),
      currency: 'SYP',
      coverImage: d.coverImage,
      logoImage: null,
      isDemo: true,
      addressEn: d.addressEn,
      addressAr: d.addressAr,
      latitude: d.latitude,
      longitude: d.longitude,
      hoursEn: d.hoursEn,
      hoursAr: d.hoursAr,
      sections: d.sections,
      groups,
      pcs,
      counts: countStatuses(pcs),
      types: countByType(pcs),
      games: (DEMO_ARENA_GAMES[d.slug] ?? [])
        .flatMap((slug) => GAMES.filter((g) => g.slug === slug))
        .map((g) => withCover({ slug: g.slug, name: g.name, genreEn: GENRES[g.genre].en, genreAr: GENRES[g.genre].ar, imageUrl: null }))
        .sort((a, b) => a.name.localeCompare(b.name, 'en')),
    };
  });
}
