/**
 * @file      geocode.ts – Adresse ↔ Koordinaten mit mehrstufigem Fallback
 * @layer     Backend · Infrastruktur (I/O: Google Geocoding / OSM Nominatim, offline: towns.ts)
 * @einstieg  geocode(address, data) · reverseGeocode(lat, lng)
 * @genutzt   index.ts → GET /api/geocode(/reverse) → Web: LocationAssist (Korrektur in der Stammdaten-Ansicht)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 *
 * DATEN: 8 Anfragen ohne Koordinaten + Tippfehler in Adressen. Kette: Google → OSM → gleiche PLZ im Datensatz → Ortsmitte.
 * ANNAHME: Ergebnis wird nie automatisch übernommen – der Planer bestätigt; `precision` zeigt, wie genau es ist.
 */
import { config } from './config.js';
import type { Dataset } from './types.js';
import { findTown, nearestTown } from './towns.js';

/** Geocoding: Google (wenn Key vorhanden & Geocoding API aktiv), sonst OpenStreetMap/Nominatim */
export interface GeoResult { lat: number; lng: number; address: string; source: 'google' | 'osm' | 'dataset' | 'offline'; precision: 'exact' | 'street' | 'town' }

const cache = new Map<string, GeoResult | null>();
const UA = { 'User-Agent': 'heizma-case-study/1.0', 'Accept-Language': 'de' };

// MARK: - Anbieter (je 4 s Timeout)

async function google(params: string): Promise<GeoResult | null> {
  const key = config.map?.googleMapsApiKey;
  if (!key) return null;
  const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}&region=at&language=de&key=${key}`, { signal: AbortSignal.timeout(4000) });
  const json = (await res.json()) as any;
  const r = json.results?.[0];
  if (json.status !== 'OK' || !r) {
    console.warn(`[geocode] Google: ${json.status}${json.error_message ? ` – ${json.error_message}` : ''}`);
    return null;
  }
  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, address: shorten(r.formatted_address), source: 'google', precision: 'exact' };
}

async function osm(path: string): Promise<GeoResult | null> {
  const res = await fetch(`https://nominatim.openstreetmap.org/${path}&format=jsonv2&addressdetails=1`, { headers: UA, signal: AbortSignal.timeout(4000) });
  if (!res.ok) {
    console.warn(`[geocode] OSM: HTTP ${res.status}`);
    return null;
  }
  const json = (await res.json()) as any;
  const r = Array.isArray(json) ? json[0] : json;
  if (!r || r.error) return null;
  const a = r.address ?? {};
  const street = [a.road, a.house_number].filter(Boolean).join(' ');
  const town = [a.postcode, a.city ?? a.town ?? a.village ?? a.municipality].filter(Boolean).join(' ');
  return { lat: Number(r.lat), lng: Number(r.lon), address: [street, town].filter(Boolean).join(', ') || r.display_name, source: 'osm', precision: 'exact' };
}

/** "Rosenweg 20, 3580 Horn, Österreich" → "Rosenweg 20, 3580 Horn" */
const shorten = (s: string) => s.replace(/,\s*(Österreich|Austria)$/i, '');

/** Probiert Anbieter nacheinander, cached auch Fehlschläge (null) pro Prozess. */
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

// MARK: - Vorwärts-Geocoding (EINSTIEG)

/**
 * DATEN: Stufenweise Suche – Adressen enthalten absichtlich Tippfehler:
 * 1. ganze Adresse  2. Straße ohne Hausnummer  3. nur PLZ + Ort.
 * precision sagt der Oberfläche, wie genau das Ergebnis ist.
 */
export async function geocode(address: string, data?: Dataset): Promise<GeoResult | null> {
  const [streetPart = '', ...rest] = address.split(',').map((s) => s.trim());
  const town = rest.join(', ');
  const street = streetPart.replace(/\s+\d+\w*(\/\d+)*$/, '');
  const attempts: [string, GeoResult['precision']][] = [[address, 'exact']];
  if (town && street !== streetPart) attempts.push([`${street}, ${town}`, 'street']);
  if (town) attempts.push([town, 'town']);

  for (const [q, precision] of attempts) {
    const hit = await withFallback(
      `f:${q}`,
      () => google(`address=${encodeURIComponent(q)}`),
      () => osm(`search?countrycodes=at&limit=1&q=${encodeURIComponent(q)}`),
    );
    if (hit) return { ...hit, precision };
  }
  return localGeocode(address, data);
}

// MARK: - Offline-Fallback

const plzOf = (s: string) => s.match(/\b\d{4}\b/)?.[0];

/**
 * Offline-Fallback – funktioniert ohne Netz:
 * 1. andere Anfragen derselben PLZ mit Koordinaten → deren Mittelpunkt
 * 2. Ortsverzeichnis (PLZ/Ortsname) → Ortsmitte
 */
function localGeocode(address: string, data?: Dataset): GeoResult | null {
  const town = address.split(',').slice(1).join(',').trim() || address;
  const plz = plzOf(town);
  const peers = (data?.requests ?? []).filter((r) => r.lat != null && r.lng != null && plz && plzOf(r.address.split(',').pop() ?? '') === plz);
  if (peers.length) {
    const lat = peers.reduce((s, r) => s + r.lat!, 0) / peers.length;
    const lng = peers.reduce((s, r) => s + r.lng!, 0) / peers.length;
    return { lat, lng, address: town, source: 'dataset', precision: 'town' };
  }
  const t = findTown(town);
  if (t) return { lat: t[2], lng: t[3], address: `${t[1]} ${t[0]}`, source: 'offline', precision: 'town' };
  return null;
}

// MARK: - Rückwärts-Geocoding (Pin auf der Karte → Adresse)

export async function reverseGeocode(lat: number, lng: number): Promise<GeoResult | null> {
  const hit = await withFallback(`r:${lat},${lng}`, () => google(`latlng=${lat},${lng}`), () => osm(`reverse?lat=${lat}&lon=${lng}`));
  if (hit) return hit;
  // Offline: nächster Ort, sofern plausibel nah (Straße bleibt unbekannt)
  const { town, km } = nearestTown(lat, lng);
  if (km > 15) return null;
  return { lat, lng, address: `${town[1]} ${town[0]}`, source: 'offline', precision: 'town' };
}
