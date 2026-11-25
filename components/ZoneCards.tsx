import { StationIcon } from '@/components/StationIcons';
import type { PcView } from '@/lib/availability';
import {
  fieldValue,
  fieldsFor,
  groupName,
  groupNote,
  numberRanges,
  sharedPrice,
  type GroupView,
  type SpecField,
} from '@/lib/groups';
import { dictionary, type Locale } from '@/lib/i18n';

// The arena's zones: one card per zone with its hardware. A zone with a photo
// (often the VIP room) gets a wide "post" card: photo beside the text.
// Stations not in any zone but with an old one-line spec are listed below.

export default function ZoneCards({ locale, groups, pcs }: { locale: Locale; groups: GroupView[]; pcs: PcView[] }) {
  const t = dictionary(locale);
  const zones = groups
    .map((g) => ({ g, pcs: pcs.filter((p) => p.groupId === g.id) }))
    .filter((z) => z.pcs.length > 0);
  const legacy = legacyLines(pcs.filter((p) => !p.groupId));
  if (zones.length === 0 && legacy.length === 0) return null;

  return (
    <section className="hud p-5 sm:p-7" aria-labelledby="zones-title">
      <h2 id="zones-title" className="mb-5 font-display text-2xl font-bold text-ink">
        {t.zones.title}
      </h2>
      {/* dense: a small card fills the gap left beside a wide photo card */}
      <div className="grid gap-4 sm:grid-flow-row-dense sm:grid-cols-2">
        {zones.map(({ g, pcs: list }) => (
          <ZoneCard key={g.id} locale={locale} g={g} pcs={list} />
        ))}
      </div>
      {legacy.length > 0 && (
        <dl className={`grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 ${zones.length ? 'mt-5 border-t border-line pt-5' : ''}`}>
          {legacy.map((l) => (
            <div key={`${l.type}-${l.range}`} className="flex justify-between gap-4">
              <dt className="text-muted">
                {t.station.typeShort[l.type]} <span className="font-hud text-ink">{l.range}</span>
              </dt>
              <dd className="text-ink">
                <bdi dir="ltr">{l.specs}</bdi>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function ZoneCard({ locale, g, pcs }: { locale: Locale; g: GroupView; pcs: PcView[] }) {
  const t = dictionary(locale);
  const name = groupName(g, locale) || t.station.typeTitle[g.type];
  const note = groupNote(g, locale);
  const price = sharedPrice(pcs.map((p) => p.hourlyRate));
  const { key, more } = fieldsFor(g.type);
  const rows = (fields: readonly SpecField[]) => fields.map((f) => ({ f, v: fieldValue(g, f) })).filter((r) => r.v);
  const keyRows = rows(key);
  const moreRows = rows(more);
  const wide = !!g.imageUrl;

  const frame = g.isVip
    ? 'bg-gradient-to-b from-gold/[0.07] to-transparent shadow-[inset_0_0_0_1px_rgba(255,201,77,0.45)]'
    : 'bg-void/40 shadow-[inset_0_0_0_1px_rgba(157,92,255,0.3)]';

  return (
    <article
      className={`${wide ? 'sm:col-span-2 md:grid md:grid-cols-[5fr_6fr]' : ''} overflow-hidden [clip-path:polygon(12px_0,100%_0,100%_calc(100%-12px),calc(100%-12px)_100%,0_100%,0_12px)] ${frame}`}
    >
      {wide && (
        // A fixed frame: 16:9 on phones; beside the text on wider screens, as
        // tall as the text (never the photo's own height).
        <div className="relative aspect-[16/9] w-full overflow-hidden md:aspect-auto md:h-full md:min-h-64">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={g.imageUrl!} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold text-ink">
              <StationIcon type={g.type} className={`h-5 w-6 shrink-0 ${g.isVip ? 'text-gold' : 'text-violet-soft'}`} />
              {name}
              {g.isVip && <span className="bg-gold px-1.5 py-px font-hud text-[0.6875rem] font-bold text-void">{t.zones.vip}</span>}
            </h3>
            <p className="mt-0.5 font-hud text-sm text-muted">
              <bdi dir="ltr">
                {t.station.typeShort[g.type]} {numberRanges(pcs.map((p) => p.typeIndex), locale)}
              </bdi>
            </p>
          </div>
          {price && <p className="shrink-0 font-hud text-sm text-violet-soft">{t.station.perHour(price)}</p>}
        </header>

        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}

        {keyRows.length > 0 && <SpecList locale={locale} rows={keyRows} />}

        {moreRows.length > 0 && (
          <details className="zone-more group/more">
            <summary className="cursor-pointer list-none text-sm text-cyan hover:underline [&::-webkit-details-marker]:hidden">
              <span className="group-open/more:hidden">{t.zones.more} ▾</span>
              <span className="hidden group-open/more:inline">{t.zones.less} ▴</span>
            </summary>
            <div className="mt-3">
              <SpecList locale={locale} rows={moreRows} />
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

function SpecList({ locale, rows }: { locale: Locale; rows: { f: SpecField; v: string }[] }) {
  const t = dictionary(locale);
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
      {rows.map((r) => (
        <div key={r.f} className="min-w-0 border-s-2 border-violet/40 ps-2.5">
          <dt className="text-xs text-muted">{t.zones.fields[r.f]}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-ink" title={r.v}>
            <bdi dir="ltr">{r.v}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Old one-line specs of stations outside any zone: "PC 1–8: RTX 4060 · 165 Hz". */
function legacyLines(pcs: PcView[]): { type: string; range: string; specs: string }[] {
  const groups: { type: string; from: number; to: number; specs: string }[] = [];
  for (const pc of pcs) {
    if (!pc.specs) continue;
    const last = groups[groups.length - 1];
    if (last && last.type === pc.type && last.specs === pc.specs && last.to === pc.typeIndex - 1) last.to = pc.typeIndex;
    else groups.push({ type: pc.type, from: pc.typeIndex, to: pc.typeIndex, specs: pc.specs });
  }
  return groups.map((g) => ({ type: g.type, range: g.from === g.to ? `${g.from}` : `${g.from}–${g.to}`, specs: g.specs }));
}
