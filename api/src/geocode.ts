import { config } from './config.js';

/** Geocoding: Google (wenn Key vorhanden & Geocoding API aktiv), sonst OpenStreetMap/Nominatim */
export interface GeoResult { lat: number; lng: number; address: string; source: 'google' | 'osm' }

const cache = new Map<string, GeoResult | null>();
const UA = { 'User-Agent': 'heizma-case-study/1.0', 'Accept-Language': 'de' };

async function google(params: string): Promise<GeoResult | null> {
  const key = config.map?.googleMapsApiKey;
  if (!key) return null;
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}&region=at&language=de&key=${key}`);
  const json = (await res.json()) as any;
  const r = json.results?.[0];
  if (json.status !== 'OK' || !r) return null;
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: shorten(r.formatted_address), source: 'google' };
}

async function osm(path: string): Promise<GeoResult | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&addressdetails=1`, { headers: UA });
  if (!res.ok) return null;
  const json = (await res.json()) as any;
  const r = Array.isArray(json) ? json[0] : json;
  if (!r || r.error) return null;
  const a = r.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const town = [a.postcode, a.city ?? a.town ?? a.village ?? a.municipality].filter(Boolean).join(' ');
  return { lat: Number(r.lat), lng: Number(r.lon), address: [street, town].filter(Boolean).join(', ') || r.display_name, source: 'osm' };
}

/** "Rosenweg 20, 3580 Horn, Österreich" → "Rosenweg 20, 3580 Horn" */
const shorten = (s: string) => s.replace(/,\s*(Österreich|Austria)$/i, '');

async function withFallback(key: string, ...tries: (() => Promise<GeoResult | null>)[]) {
  if (cache.has(key)) return cache.get(key)!;
  let result: GeoResult | null = null;
  for (const t of tries) {
    try { result = await t(); } catch { result = null; }
    if (result) break;
  }
  cache.set(key, result);
  return result;
}

export const geocode = (address: string) =>
  withFallback(`f:${address}`, () => google(`address=${encodeURIComponent(address)}`), () => osm(`search?countrycodes=at&limit=1&q=${encodeURIComponent(address)}`));

export const reverseGeocode = (lat: number, lng: number) =>
  withFallback(`r:${lat},${lng}`, () => google(`latlng=${lat},${lng}`), () => osm(`reverse?lat=${lat}&lon=${lng}`));
