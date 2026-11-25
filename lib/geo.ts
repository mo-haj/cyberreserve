// Straight-line distance between two map points (haversine), in km.
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "850 m"-style is not needed: 0.4 -> "0.4", 12.34 -> "12". */
export function formatKm(km: number): string {
  return km < 10 ? km.toFixed(1) : Math.round(km).toString();
}
