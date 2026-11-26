// Owner panel input rules (pure, unit-tested). Every change an owner or staff
// member makes goes through ManageAction; the API refuses anything else.
import { z } from 'zod';
import { CITIES } from '@/lib/cities';

export const STATION_TYPES = ['PC', 'PS5', 'PS4', 'XBOX'] as const;

/** "150" or "150.50"; 1 to 10,000,000 SP. */
const Price = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/, 'price')
  .refine((v) => Number(v) >= 1 && Number(v) <= 10_000_000, 'price');
/** Empty string = no own price (use the arena's). */
const OptionalPrice = z.union([Price, z.literal('')]).optional();
const ShortText = (max: number) => z.string().trim().max(max);
const Text = (min: number, max: number) => z.string().trim().min(min).max(max);
const PcNumber = z.number().int().min(1).max(999);

/**
 * "33.5036, 36.2546" (as copied from Google Maps) -> { lat, lng }, else null.
 * Also accepts a Google Maps link containing "@lat,lng" or "q=lat,lng".
 */
export function parseLatLng(raw: string): { lat: number; lng: number } | null {
  const text = raw.trim();
  const m =
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(text) ??
    /[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i.exec(text) ??
    /^\(?\s*(-?\d{1,2}\.\d+)\s*[,،\s]\s*(-?\d{1,3}\.\d+)\s*\)?$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

const Uuid = z.string().regex(/^[0-9a-f-]{36}$/);

const StationFields = {
  type: z.enum(STATION_TYPES),
  label: ShortText(40).optional(),
  /** Legacy one-line specs; left unchanged when not sent. */
  specs: ShortText(120).optional(),
  /** Zone to put the station in; '' = none; not sent = unchanged. */
  groupId: z.union([Uuid, z.literal('')]).optional(),
  hourlyRate: OptionalPrice,
  nightRate: OptionalPrice,
};

export const ManageAction = z.discriminatedUnion('action', [
  // Staff and owners: the live floor.
  z.object({
    action: z.literal('walkIn'),
    pcNumber: PcNumber,
    minutes: z.number().int().min(15).max(12 * 60),
    // A player with an account (picked in the panel), or a guest's name, or neither.
    playerId: z.string().uuid().optional(),
    guestName: z.string().trim().max(40).optional(),
  }),
  z.object({ action: z.literal('freeNow'), pcNumber: PcNumber }),
  // Staff and owners: start / end their shift (who did what, in which shift).
  z.object({ action: z.literal('shift'), on: z.boolean() }),
  // Add time to the session running on a station now.
  z.object({ action: z.literal('extend'), pcNumber: PcNumber, minutes: z.number().int().min(15).max(6 * 60) }),
  z.object({ action: z.literal('maintenance'), pcNumber: PcNumber, on: z.boolean() }),
  z.object({
    action: z.literal('markBooking'),
    bookingId: z.string().regex(/^[0-9a-f-]{36}$/),
    mark: z.enum(['arrived', 'noshow', 'cancel']),
    /** Cancel only: "k:<key>" or the owner's own words, sent to the player. */
    reason: z.string().trim().max(300).optional(),
    /** Cancel only: also stop this player booking here. */
    ban: z.object({ minutes: z.number().int().min(60).max(5 * 365 * 24 * 60).nullable(), reason: z.string().trim().min(3).max(300) }).optional(),
  }),
  z.object({
    action: z.literal('banPlayer'),
    userId: z.string().min(1).max(64),
    /** null = for good. */
    minutes: z.number().int().min(60).max(5 * 365 * 24 * 60).nullable(),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({ action: z.literal('unbanPlayer'), userId: z.string().min(1).max(64) }),
  // Owners only: stations.
  z.object({ action: z.literal('addStations'), count: z.number().int().min(1).max(30), ...StationFields }),
  z.object({ action: z.literal('editStation'), pcNumber: PcNumber, ...StationFields }),
  z.object({ action: z.literal('removeStation'), pcNumber: PcNumber }),
  // Owners only: arena details.
  z.object({
    action: z.literal('editArena'),
    nameAr: Text(2, 60),
    nameEn: Text(2, 60),
    taglineAr: ShortText(160),
    taglineEn: ShortText(160),
    city: z.enum(CITIES.map((c) => c.key) as [string, ...string[]]),
    areaAr: Text(2, 60),
    areaEn: Text(2, 60),
    addressAr: Text(2, 160),
    addressEn: Text(2, 160),
    hoursAr: Text(2, 80),
    hoursEn: Text(2, 80),
    hourlyRate: Price,
    nightShiftRate: Price,
    /** Map pin as text ("33.50, 36.25" or a Google Maps link); empty = no map. */
    location: ShortText(500),
    /** Opening hours "HH:MM" (Damascus); both empty = not set; equal = 24 hours. */
    openTime: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default(''),
    closeTime: z.union([z.literal(''), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)]).default(''),
  }),
  // Owners only: zones (spec cards). `stations` = station numbers in it.
  z.object({
    action: z.literal('saveGroup'),
    id: Uuid.optional(),
    type: z.enum(STATION_TYPES),
    nameAr: ShortText(40),
    nameEn: ShortText(40),
    noteAr: ShortText(300),
    noteEn: ShortText(300),
    isVip: z.boolean(),
    cpu: ShortText(60),
    gpu: ShortText(60),
    ram: ShortText(60),
    storage: ShortText(60),
    screen: ShortText(60),
    refreshHz: z.number().int().min(30).max(1000).nullable(),
    controllers: z.number().int().min(1).max(16).nullable(),
    keyboard: ShortText(60),
    mouse: ShortText(60),
    headset: ShortText(60),
    chair: ShortText(60),
    stations: z.array(PcNumber).max(200),
  }),
  z.object({ action: z.literal('removeGroup'), id: Uuid }),
  z.object({ action: z.literal('moveGroup'), id: Uuid, by: z.union([z.literal(-1), z.literal(1)]) }),
  // Drag and drop: the zones' new order, every id once.
  z.object({ action: z.literal('orderGroups'), ids: z.array(Uuid).min(1).max(100) }),
  // Owners: photo + text posts on the arena page (photo uploaded separately).
  z.object({
    action: z.literal('savePost'),
    id: Uuid.optional(),
    titleAr: ShortText(80),
    titleEn: ShortText(80),
    bodyAr: ShortText(5000),
    bodyEn: ShortText(5000),
  }),
  z.object({ action: z.literal('removePost'), id: Uuid }),
  z.object({
    action: z.literal('saveOffer'),
    id: Uuid.optional(),
    kind: z.enum(['package', 'rate', 'percent']).default('package'),
    hours: z.number().int().min(1).max(24),
    price: Price,
    stationType: z.union([z.enum(STATION_TYPES), z.literal('')]),
    noteAr: ShortText(120),
    noteEn: ShortText(120),
  }),
  z.object({ action: z.literal('removeOffer'), id: Uuid }),
  // Owners: tournaments (followers hear about new ones).
  z.object({
    action: z.literal('saveTournament'),
    id: Uuid.optional(),
    titleAr: Text(2, 80),
    titleEn: Text(2, 80),
    game: Text(1, 60),
    /** Damascus local "YYYY-MM-DDTHH:MM". */
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    maxPlayers: z.number().int().min(2).max(256),
    fee: z.string().regex(/^\d{1,9}$/).default('0'),
    prizeAr: ShortText(160),
    prizeEn: ShortText(160),
    noteAr: ShortText(400),
    noteEn: ShortText(400),
  }),
  z.object({ action: z.literal('removeTournament'), id: Uuid }),
  z.object({ action: z.literal('removeEntry'), id: Uuid, userId: z.string().min(1).max(64) }),
  z.object({ action: z.literal('setBadge'), userId: z.string().min(1).max(64), badge: z.enum(['', 'loyal', 'vip']) }),
  z.object({ action: z.literal('movePost'), id: Uuid, by: z.union([z.literal(-1), z.literal(1)]) }),
  // Super admin only (the site owner).
  z.object({ action: z.literal('setPublished'), on: z.boolean() }),
  z.object({ action: z.literal('hideReview'), id: Uuid, hidden: z.boolean() }),
  z.object({ action: z.literal('setSearchVisible'), on: z.boolean() }),
  // Delete the arena for good (its stations, bookings, pictures...). The name must be typed back.
  z.object({ action: z.literal('deleteArena'), confirm: z.string().max(120) }),
  // Platform subscription: add a month / a year, pause or resume, or stop tracking (free).
  z.object({ action: z.literal('subscription'), op: z.enum(['MONTH', 'YEAR', 'pause', 'resume', 'free']) }),
  z.object({ action: z.literal('setMember'), phone: Text(6, 30), role: z.enum(['OWNER', 'STAFF']) }),
  z.object({ action: z.literal('removeMember'), userId: Uuid }),
  z.object({
    action: z.literal('addGame'),
    name: Text(1, 60),
    genre: z.enum(['shooter', 'moba', 'battle', 'sports', 'racing', 'fighting', 'open', 'strategy', 'coop', 'other']),
  }),
  z.object({ action: z.literal('removeGame'), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
  /** Site owner: an arena's own game joins the shared list every arena picks from. */
  z.object({ action: z.literal('promoteGame'), slug: z.string().regex(/^[a-z0-9-]{1,80}$/) }),
  z.object({ action: z.literal('setGames'), slugs: z.array(z.string().regex(/^[a-z0-9-]{1,60}$/)).max(300) }),
]);
export type ManageAction = z.infer<typeof ManageAction>;

/** What STAFF may do; OWNER may do everything. */
export const STAFF_ACTIONS = new Set<ManageAction['action']>(['walkIn', 'freeNow', 'extend', 'maintenance', 'markBooking', 'shift']);

/** Only the site owner (super admin) may do these, in any arena.
 *  (setMember / removeMember: an owner may too, for STAFF only; checked in the service.) */
export const SUPER_ACTIONS = new Set<ManageAction['action']>(['setPublished', 'promoteGame', 'hideReview', 'setSearchVisible', 'subscription', 'deleteArena']);

export function canDo(role: 'OWNER' | 'STAFF', action: ManageAction['action'], superAdmin = false): boolean {
  if (superAdmin) return true;
  if (SUPER_ACTIONS.has(action)) return false;
  return role === 'OWNER' || STAFF_ACTIONS.has(action);
}

/** "Mezzeh Arena!" -> "mezzeh-arena" (web address of an arena page). */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Super admin: a new arena. It starts hidden until published. */
export const NewArena = z.object({
  nameAr: Text(2, 80),
  nameEn: Text(2, 80),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    .max(60),
  city: z.enum(CITIES.map((c) => c.key) as [string, ...string[]]),
  areaAr: ShortText(80),
  areaEn: ShortText(80),
  hourlyRate: Price,
});
export type NewArena = z.infer<typeof NewArena>;
