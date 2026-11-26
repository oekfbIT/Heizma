/**
 * @file      config.ts – Zentrale Konfiguration aus der .env (Datenquelle, Zeitraum, Token, Karten-Key)
 * @layer     Backend · Infrastruktur
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
// Zentrale Konfiguration – alle Werte kommen aus der .env (siehe .env.example)

function num(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: num(process.env.API_PORT, 4000),
  /** "live" = Heizma Case-Study-API, "mock" = lokale Beispieldaten (offline) */
  dataSource: (process.env.DATA_SOURCE === 'mock' ? 'mock' : 'live') as 'live' | 'mock',
  heizmaBaseUrl: process.env.HEIZMA_API_BASE_URL ?? 'https://app.heizma.at/api/casestudy',
  heizmaToken: process.env.HEIZMA_API_TOKEN ?? '',
  planFrom: process.env.PLAN_FROM ?? '2026-11-23',
  planTo: process.env.PLAN_TO ?? '2026-11-27',
  cacheTtlMs: num(process.env.CACHE_TTL_SECONDS, 600) * 1000,
  /** Heizma Firmensitz – nur als Referenzpunkt auf der Karte (Routen starten am Wohnort) */
  office: {
    label: 'Heizma Group FlexCo · Hollandstraße 10, 1020 Wien',
    lat: num(process.env.OFFICE_LAT, 48.2165),
    lng: num(process.env.OFFICE_LNG, 16.3786),
  },
  /** Karteneinstellungen – werden zur Laufzeit über /api/config an das Frontend gegeben (kein Rebuild nötig) */
  map: {
    googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY ?? '',
    googleMapsMapId: process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
    tileUrl: process.env.MAP_TILE_URL || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: process.env.MAP_ATTRIBUTION || 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap',
  },
};

if (config.dataSource === 'live' && !config.heizmaToken) {
  console.warn('[config] HEIZMA_API_TOKEN fehlt – bitte in .env setzen oder DATA_SOURCE=mock verwenden.');
}
