// Derives what players see on the live PC grid. Pure function: no database,
// no clock — the caller passes `now` (from lib/time) so it can be tested.
//
// This is a BUSINESS fact derived from bookings at read time (see CLAUDE.md
// "Status Derivation"). It never reads or writes Device.powerStatus: whether a
// machine physically answers on the LAN is a separate fact for the admin side.

export type PcStatus = 'free' | 'busy' | 'maintenance';
export type StationType = 'PC' | 'PS5' | 'PS4' | 'XBOX';

/** Display order of the station groups. */
export const STATION_TYPES: StationType[] = ['PC', 'PS5', 'PS4', 'XBOX'];

export interface DeviceInput {
  id: string;
  pcNumber: number;
  isMaintenance: boolean;
  specs: string | null;
  /** Station group (zone), if any. */
  groupId?: string | null;
  /** Defaults to PC. */
  type?: StationType;
  label?: string | null;
  /** Effective prices (station's own, or the arena's), as display strings. */
  hourlyRate?: string | null;
  nightRate?: string | null;
}

export interface BookingInput {
  deviceId: string;
  startTime: Date;
  endTime: Date;
  status: string;
}

export interface PcView {
  pcNumber: number;
  type: StationType;
  /** 1, 2, 3... within its type: "PS5 2". */
  typeIndex: number;
  label: string | null;
  hourlyRate: string | null;
  nightRate: string | null;
  status: PcStatus;
  /** Short hardware line (from the group, else the station's own). */
  specs: string | null;
  groupId: string | null;
  /** When the current booking ends (busy only), ISO string. */
  busyUntil: string | null;
}

export interface StatusCounts {
  total: number;
  free: number;
  busy: number;
  maintenance: number;
}

/** Bookings in these states hold a PC. Same set as the no_overlap_booking constraint. */
const HOLDING_STATUSES = new Set(['PENDING', 'CONFIRMED']);

export function derivePcViews(
  devices: DeviceInput[],
  bookings: BookingInput[],
  now: Date,
): PcView[] {
  const t = now.getTime();
  const activeByDevice = new Map<string, BookingInput>();
  for (const b of bookings) {
    if (!HOLDING_STATUSES.has(b.status)) continue;
    // Half-open range [start, end), matching the database constraint.
    if (b.startTime.getTime() <= t && t < b.endTime.getTime()) {
      activeByDevice.set(b.deviceId, b);
    }
  }

  const order = (t: StationType) => STATION_TYPES.indexOf(t);
  const sorted = [...devices].sort(
    (a, b) => order(a.type ?? 'PC') - order(b.type ?? 'PC') || a.pcNumber - b.pcNumber,
  );
  const seen = new Map<StationType, number>();
  return sorted.map((d) => {
    const type = d.type ?? 'PC';
    const typeIndex = (seen.get(type) ?? 0) + 1;
    seen.set(type, typeIndex);
    const base = {
      pcNumber: d.pcNumber,
      type,
      typeIndex,
      label: d.label ?? null,
      hourlyRate: d.hourlyRate ?? null,
      nightRate: d.nightRate ?? null,
      specs: d.specs,
      groupId: d.groupId ?? null,
    };
    if (d.isMaintenance) return { ...base, status: 'maintenance' as const, busyUntil: null };
    const active = activeByDevice.get(d.id);
    if (active) return { ...base, status: 'busy' as const, busyUntil: active.endTime.toISOString() };
    return { ...base, status: 'free' as const, busyUntil: null };
  });
}

/** Free / total per station type, in display order (types with no stations left out). */
export function countByType(pcs: PcView[]): { type: StationType; total: number; free: number }[] {
  return STATION_TYPES.map((type) => {
    const of = pcs.filter((p) => p.type === type);
    return { type, total: of.length, free: of.filter((p) => p.status === 'free').length };
  }).filter((c) => c.total > 0);
}

export function countStatuses(pcs: PcView[]): StatusCounts {
  const counts: StatusCounts = { total: pcs.length, free: 0, busy: 0, maintenance: 0 };
  for (const pc of pcs) counts[pc.status] += 1;
  return counts;
}
