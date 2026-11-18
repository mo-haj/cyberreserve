// Map links. All free and keyless: an OpenStreetMap embed for the small map,
// and plain Google Maps links (they open the Google Maps app on phones).

export interface LatLng {
  lat: number;
  lng: number;
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

const fix = (n: number) => n.toFixed(6);

/** Small OpenStreetMap view around the pin (about 600 m across). */
export function osmEmbedUrl({ lat, lng }: LatLng, span = 0.0035): string {
  const bbox = [lng - span, lat - span * 0.6, lng + span, lat + span * 0.6].map(fix).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${fix(lat)}%2C${fix(lng)}`;
}

export function googleMapsUrl({ lat, lng }: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${fix(lat)}%2C${fix(lng)}`;
}

export function directionsUrl({ lat, lng }: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${fix(lat)}%2C${fix(lng)}`;
}
