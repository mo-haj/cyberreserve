// Syrian cities an arena can be listed in. Arenas store the key; names come
// from here so both languages stay consistent. Add a city by adding a line.

export interface City {
  key: string;
  en: string;
  ar: string;
}

export const CITIES: City[] = [
  { key: 'damascus', en: 'Damascus', ar: 'دمشق' },
  { key: 'rif-dimashq', en: 'Rif Dimashq', ar: 'ريف دمشق' },
  { key: 'aleppo', en: 'Aleppo', ar: 'حلب' },
  { key: 'homs', en: 'Homs', ar: 'حمص' },
  { key: 'hama', en: 'Hama', ar: 'حماة' },
  { key: 'latakia', en: 'Latakia', ar: 'اللاذقية' },
  { key: 'tartus', en: 'Tartus', ar: 'طرطوس' },
  { key: 'idlib', en: 'Idlib', ar: 'إدلب' },
  { key: 'daraa', en: 'Daraa', ar: 'درعا' },
  { key: 'as-suwayda', en: 'As-Suwayda', ar: 'السويداء' },
  { key: 'quneitra', en: 'Quneitra', ar: 'القنيطرة' },
  { key: 'deir-ez-zor', en: 'Deir ez-Zor', ar: 'دير الزور' },
  { key: 'raqqa', en: 'Raqqa', ar: 'الرقة' },
  { key: 'al-hasakah', en: 'Al-Hasakah', ar: 'الحسكة' },
];

export const DEFAULT_CITY = 'damascus';

export function cityByKey(key: string | null | undefined): City | null {
  return CITIES.find((c) => c.key === key) ?? null;
}

export function cityName(key: string, locale: 'ar' | 'en'): string {
  const c = cityByKey(key);
  if (!c) return key;
  return locale === 'ar' ? c.ar : c.en;
}

/**
 * Remembers the last city picked on the home page ("all" = all of Syria), so
 * players do not have to slide to their city every visit. Not secret.
 */
export const CITY_COOKIE = 'cr_city';
export const CITY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

export function cityCookieOptions() {
  return { path: '/', maxAge: CITY_COOKIE_MAX_AGE, sameSite: 'lax' as const, httpOnly: false };
}

/** Home page start city: link (?city=) > last pick (cookie) > profile city > all. */
export function resolveStartCity(
  param: string | string[] | undefined,
  cookie: string | undefined,
  homeCity: string | null | undefined,
): string | null {
  if (typeof param === 'string') return cityByKey(param)?.key ?? null;
  if (cookie === 'all') return null;
  return cityByKey(cookie)?.key ?? cityByKey(homeCity)?.key ?? null;
}
