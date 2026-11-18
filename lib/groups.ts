// Station groups ("zones"): stations of one type with the same hardware,
// shown as a spec card on the arena page. A VIP room with a photo is a group
// too. Pure helpers, shared by the server and the browser, unit-tested.
import type { StationType } from '@/lib/availability';

/** Hardware fields, in the order the card shows them. */
export const PC_KEY_FIELDS = ['cpu', 'gpu', 'ram', 'screen'] as const;
export const PC_MORE_FIELDS = ['storage', 'keyboard', 'mouse', 'headset', 'chair'] as const;
export const CONSOLE_KEY_FIELDS = ['screen', 'controllers'] as const;
export const CONSOLE_MORE_FIELDS = ['headset', 'chair'] as const;

export type SpecField =
  | 'cpu'
  | 'gpu'
  | 'ram'
  | 'storage'
  | 'screen'
  | 'keyboard'
  | 'mouse'
  | 'headset'
  | 'chair'
  | 'controllers';

export interface GroupView {
  id: string;
  type: StationType;
  nameAr: string;
  nameEn: string;
  noteAr: string;
  noteEn: string;
  isVip: boolean;
  imageUrl: string | null;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  screen: string;
  refreshHz: number | null;
  controllers: number | null;
  keyboard: string;
  mouse: string;
  headset: string;
  chair: string;
}

type Hardware = Pick<GroupView, 'type' | 'gpu' | 'ram' | 'screen' | 'refreshHz'>;

const isConsole = (t: StationType) => t !== 'PC';

/** Fields the card shows up front, and behind "more", for this type. */
export function fieldsFor(type: StationType): { key: readonly SpecField[]; more: readonly SpecField[] } {
  return isConsole(type)
    ? { key: CONSOLE_KEY_FIELDS, more: CONSOLE_MORE_FIELDS }
    : { key: PC_KEY_FIELDS, more: PC_MORE_FIELDS };
}

/** The screen line: '27" 1440p · 240 Hz', or just '240 Hz'. */
export function screenLine(g: Pick<GroupView, 'screen' | 'refreshHz'>): string {
  return [g.screen, g.refreshHz ? `${g.refreshHz} Hz` : ''].filter(Boolean).join(' · ');
}

/** Value shown for a field (empty = the card skips it). */
export function fieldValue(g: GroupView, field: SpecField): string {
  if (field === 'screen') return screenLine(g);
  if (field === 'controllers') return g.controllers ? String(g.controllers) : '';
  return g[field];
}

/** One short line for the booking popup: "RTX 4070 · 240 Hz · 32 GB". */
export function groupSummary(g: Hardware): string {
  if (isConsole(g.type)) return screenLine(g);
  return [g.gpu, g.refreshHz ? `${g.refreshHz} Hz` : '', g.ram].filter(Boolean).join(' · ');
}

/** [1,2,3,5,7,8] -> "1–3، 5، 7–8" (Arabic comma in Arabic). */
export function numberRanges(nums: number[], locale: 'ar' | 'en'): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const from = sorted[i];
    while (i + 1 < sorted.length && sorted[i + 1] === sorted[i] + 1) i++;
    const to = sorted[i];
    parts.push(from === to ? `${from}` : to === from + 1 ? `${from}${locale === 'ar' ? '، ' : ', '}${to}` : `${from}–${to}`);
  }
  return parts.join(locale === 'ar' ? '، ' : ', ');
}

/** The group's name in this language, else the other one, else ''. */
export function groupName(g: Pick<GroupView, 'nameAr' | 'nameEn'>, locale: 'ar' | 'en'): string {
  return (locale === 'ar' ? g.nameAr || g.nameEn : g.nameEn || g.nameAr).trim();
}

/** Same rule for the note. */
export function groupNote(g: Pick<GroupView, 'noteAr' | 'noteEn'>, locale: 'ar' | 'en'): string {
  return (locale === 'ar' ? g.noteAr || g.noteEn : g.noteEn || g.noteAr).trim();
}

/** The one price shared by all the group's stations, or null when they differ. */
export function sharedPrice(prices: (string | null)[]): string | null {
  const set = new Set(prices.filter((p): p is string => !!p));
  return set.size === 1 ? [...set][0] : null;
}
