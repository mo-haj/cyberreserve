import { dictionary, type Locale } from '@/lib/i18n';
import { googleMapsUrl, isValidLatLng, osmEmbedUrl } from '@/lib/maps';

// Small map of the arena's street (OpenStreetMap, free, no key), tinted to the
// site's dark look, plus buttons that open Google Maps. Server-rendered; the
// map itself loads only when scrolled near (loading="lazy").
export default function ArenaMap({
  locale,
  lat,
  lng,
  name,
}: {
  locale: Locale;
  lat: number | null;
  lng: number | null;
  name: string;
}) {
  if (!isValidLatLng(lat, lng)) return null;
  const t = dictionary(locale);
  const pin = { lat: lat as number, lng: lng as number };
  return (
    <section className="hud overflow-hidden" aria-labelledby="map-title">
      <div className="flex items-baseline justify-between gap-3 px-5 pt-4">
        <h2 id="map-title" className="font-display text-xl font-bold text-ink">
          {t.map.title}
        </h2>
      </div>
      <div className="arena-map relative mx-5 mt-3 aspect-[16/10] overflow-hidden">
        <iframe
          title={t.map.frameTitle(name)}
          src={osmEmbedUrl(pin)}
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts allow-same-origin allow-popups"
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      <div className="p-5 pt-3">
        {/* One button: on phones it opens the Google Maps app, which also gives directions. */}
        <a href={googleMapsUrl(pin)} target="_blank" rel="noopener noreferrer" className="btn-neon w-full justify-center whitespace-nowrap text-sm">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" strokeLinejoin="round" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          {t.map.openGoogle}
        </a>
      </div>
    </section>
  );
}
