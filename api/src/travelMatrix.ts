/**
 * @file      travelMatrix.ts – Fahrzeitmatrix aus POST /travel/path (gecacht) + Schätz-Fallback
 * @layer     Backend · Infrastruktur (I/O: Heizma-API, Datei-Cache)
 * @einstieg  getTravelMatrix(data) → { lookup, stats } · estimateLookup (Tests/Mock)
 * @genutzt   planner.ts und verify.ts nutzen ausschließlich das Interface `TravelLookup`
 * @siehe     docs/03-planung-und-regeln.md#fahrzeiten · docs/10-code-navigation.md
 *
 * Fahrzeitquelle tauschen (OSRM, Google, Mapbox …): nur hier ein neues `TravelLookup` bauen –
 * Planer und Prüfung bleiben unverändert.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';
import { estimateTravelMinutes, hasCoords } from './geo.js';
import { travelPathRaw } from './heizmaClient.js';
import type { Dataset, LatLng } from './types.js';
import { eligibleTechnicians } from './validation.js';
import seedJson from './fixtures/travel-cache.seed.json';

/**
 * Fahrzeitmatrix aus der Heizma-API (/travel/path).
 *
 * Idee: Wir brauchen nur Paare, die in einer Route überhaupt nebeneinander liegen können –
 * also Punkte, die sich mindestens einen zuständigen Techniker teilen (Wohnort, Anfragen, fixe Termine).
 * Diese Paare werden zu Pfaden mit max. 14 Punkten verkettet (13 Fahrten pro Call statt 1),
 * parallel geladen und auf Platte gecacht. Fehlt ein Paar, fällt es auf die Luftlinien-Schätzung
 * zurück und wird als "geschätzt" markiert – der Validator weist das aus.
 *
 * ANNAHME · TRADE-OFF: Fahrzeit A→B ≈ B→A. Halbiert die Calls; Abweichung auf Landstraßen gering.
 */

// MARK: - Öffentliche Typen

/** Einzige Schnittstelle, die Planer und Prüfung kennen. Synchron → schnelle Simulation ohne await. */
export interface TravelLookup {
  minutes(a: LatLng, b: LatLng): number;
  isEstimated(a: LatLng, b: LatLng): boolean;
}

export interface MatrixStats {
  source: 'heizma' | 'estimate' | 'mixed';
  pairsNeeded: number;
  pairsReal: number;
  pairsEstimated: number;
  apiCalls: number;
  builtAt: string;
}

// MARK: - Datei-Cache (api/data/travel-cache.json · auf Vercel /tmp) + mitgelieferter Seed
// Der Seed (src/fixtures/travel-cache.seed.json) ist Teil des Codes: lokal, in Docker und auf Vercel sind
// alle Fahrzeiten ab dem ersten Request da – ohne Vorab-Skript. Fehlende Paare werden nachgeladen,
// lokal in den Seed zurückgeschrieben und kommen mit dem nächsten Push automatisch auf Vercel.
// ACHTUNG: Datei-Cache löschen ist unkritisch (Seed bleibt). Seed löschen = Fahrzeiten werden neu geladen (Minuten).

const CACHE_PATH = resolve(
  process.env.TRAVEL_CACHE_PATH ?? (process.env.VERCEL ? '/tmp/heizma-travel-cache.json' : resolve(process.cwd(), 'data/travel-cache.json')),
);

type CacheFile = { version: 1; pairs: Record<string, { minutes: number; km: number; estimated: boolean }> };

const ptKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
const pairKey = (a: LatLng, b: LatLng) => {
  const ka = ptKey(a), kb = ptKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

const SEED = seedJson as unknown as CacheFile;

/** Seed + Datei-Cache (Datei gewinnt bei gleichem Paar) */
function readCache(): CacheFile {
  const pairs = { ...SEED.pairs };
  try {
    if (existsSync(CACHE_PATH)) Object.assign(pairs, (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile).pairs);
  } catch {
    /* kaputter Cache → Seed reicht, Rest wird nachgeladen */
  }
  return { version: 1, pairs };
}

/**
 * Seed im Quellcode aktualisieren (nur lokal im Repo, nie auf Vercel/Docker): so landen neu geladene
 * Fahrzeiten mit dem nächsten Commit automatisch im Deployment. Nur echte Fahrzeiten, sortiert für stabile Diffs.
 */
const SEED_PATH = resolve(process.cwd(), 'src/fixtures/travel-cache.seed.json');
function writeSeed(c: CacheFile) {
  if (process.env.VERCEL || !existsSync(dirname(SEED_PATH))) return;
  const keys = Object.keys(c.pairs).filter((k) => !c.pairs[k].estimated).sort();
  if (keys.length <= Object.keys(SEED.pairs).length) return;
  try {
    const pairs: CacheFile['pairs'] = {};
    for (const k of keys) pairs[k] = c.pairs[k];
    writeFileSync(SEED_PATH, JSON.stringify({ version: 1, pairs }) + '\n');
    console.log(`[travel] Seed aktualisiert: ${keys.length} Paare (kommt mit dem nächsten Push auf Vercel)`);
  } catch (e) {
    console.warn('[travel] Seed nicht schreibbar:', (e as Error).message);
  }
}

function writeCache(c: CacheFile) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(c));
  } catch (e) {
    console.warn('[travel] Cache nicht schreibbar:', (e as Error).message);
  }
}

// MARK: - Welche Paare werden gebraucht?

/** Alle Punktpaare, die in einer Route benachbart sein können (REGEL-5: nur Punkte mit gemeinsamer zuständiger Person) */
function neededPairs(data: Dataset): Map<string, [LatLng, LatLng]> {
  const groups = new Map<string, LatLng[]>(data.technicians.map((t) => [t.id, [{ lat: t.home.lat, lng: t.home.lng }]]));
  for (const r of data.requests) {
    if (!hasCoords(r)) continue;
    for (const t of eligibleTechnicians(r, data.technicians)) groups.get(t.id)!.push({ lat: r.lat, lng: r.lng });
  }
  for (const a of data.appointments) groups.get(a.technicianId)?.push({ lat: a.lat, lng: a.lng });

  const pairs = new Map<string, [LatLng, LatLng]>();
  for (const pts of groups.values()) {
    const uniq = [...new Map(pts.map((p) => [ptKey(p), p])).values()];
    for (let i = 0; i < uniq.length; i++)
      for (let j = i + 1; j < uniq.length; j++) pairs.set(pairKey(uniq[i], uniq[j]), [uniq[i], uniq[j]]);
  }
  return pairs;
}

// MARK: - Paare → möglichst wenige API-Calls

/** Paare zu Pfaden verketten (Kanten-Walk, jede Kante genau einmal), dann in 14er-Stücke schneiden */
function pairsToPaths(pairs: [LatLng, LatLng][]): LatLng[][] {
  const adj = new Map<string, { to: string; edge: number }[]>();
  const pos = new Map<string, LatLng>();
  pairs.forEach(([a, b], edge) => {
    const ka = ptKey(a), kb = ptKey(b);
    pos.set(ka, a);
    pos.set(kb, b);
    (adj.get(ka) ?? adj.set(ka, []).get(ka)!).push({ to: kb, edge });
    (adj.get(kb) ?? adj.set(kb, []).get(kb)!).push({ to: ka, edge });
  });
  const used = new Set<number>();
  const trails: string[][] = [];
  // Mit ungeraden Knoten beginnen → weniger, längere Pfade
  const starts = [...adj.keys()].sort((x, y) => (adj.get(y)!.length % 2) - (adj.get(x)!.length % 2));
  for (const s of starts) {
    while (adj.get(s)!.some((e) => !used.has(e.edge))) {
      const trail = [s];
      let cur = s;
      for (;;) {
        const next = adj.get(cur)!.find((e) => !used.has(e.edge));
        if (!next) break;
        used.add(next.edge);
        trail.push(next.to);
        cur = next.to;
      }
      trails.push(trail);
    }
  }
  const chunks: LatLng[][] = [];
  for (const t of trails) for (let i = 0; i < t.length - 1; i += 13) chunks.push(t.slice(i, i + 14).map((k) => pos.get(k)!));
  return chunks;
}

async function pool<T>(items: T[], limit: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// MARK: - Matrix laden (EINSTIEG)

// In-Memory-Stand: `current` = fertige Matrix für den Datenstand, `building` = laufender Ladevorgang (verhindert Doppel-Laden)
let current: { key: string; lookup: TravelLookup; stats: MatrixStats } | null = null;
let building: Promise<void> | null = null;

/** Matrix für den Datenstand laden/aufbauen (fehlende Paare werden nachgeladen) */
export async function getTravelMatrix(data: Dataset, opts: { log?: boolean } = {}): Promise<{ lookup: TravelLookup; stats: MatrixStats }> {
  const pairs = neededPairs(data);
  // Schlüssel ohne lokale Revision (#r…): Korrekturen an Notizen o. Ä. sollen nicht jedes Mal neu laden
  const key = `${data.source}:${[...pairs.keys()].length}:${data.loadedAt.split('#')[0]}`;
  if (current && current.key === key) return current;
  if (building) await building;

  const cache = readCache();
  let apiCalls = 0;
  if (config.dataSource === 'live') {
    const missing = [...pairs.entries()].filter(([k]) => !cache.pairs[k]).map(([, p]) => p);
    if (missing.length) {
      const paths = pairsToPaths(missing);
      if (opts.log) console.log(`[travel] ${missing.length} fehlende Paare → ${paths.length} Calls an /travel/path`);
      building = (async () => {
        let failed = 0;
        // TRADE-OFF: 4 parallele Calls – schnell genug, ohne die Case-API zu fluten
        await pool(paths, 4, async (path) => {
          try {
            const legs = await travelPathRaw(path);
            apiCalls++;
            legs.forEach((leg, i) => {
              cache.pairs[pairKey(path[i], path[i + 1])] = { minutes: leg.minutes, km: leg.km, estimated: leg.estimated };
            });
            if (opts.log && apiCalls % 25 === 0) console.log(`[travel] ${apiCalls}/${paths.length}`);
          } catch (e) {
            // DATEN: fehlgeschlagener Call → Paare bleiben leer → Luftlinien-Schätzung, im UI mit „≈“ markiert
            failed++;
            if (failed <= 3) console.warn('[travel] Call fehlgeschlagen, Schätzung als Fallback:', (e as Error).message);
          }
        });
        writeCache(cache);
        writeSeed(cache);
      })();
      await building;
      building = null;
    }
  }

  let real = 0;
  for (const k of pairs.keys()) if (cache.pairs[k] && !cache.pairs[k].estimated) real++;
  const lookup: TravelLookup = {
    minutes(a, b) {
      if (ptKey(a) === ptKey(b)) return 0;
      return cache.pairs[pairKey(a, b)]?.minutes ?? estimateTravelMinutes(a, b);
    },
    isEstimated(a, b) {
      if (ptKey(a) === ptKey(b)) return false;
      const hit = cache.pairs[pairKey(a, b)];
      return !hit || hit.estimated;
    },
  };
  const stats: MatrixStats = {
    source: real === 0 ? 'estimate' : real === pairs.size ? 'heizma' : 'mixed',
    pairsNeeded: pairs.size,
    pairsReal: real,
    pairsEstimated: pairs.size - real,
    apiCalls,
    builtAt: new Date().toISOString(),
  };
  current = { key, lookup, stats };
  return current;
}

/** Nur Schätzung (Tests, Mock) */
export const estimateLookup: TravelLookup = {
  minutes: estimateTravelMinutes,
  isEstimated: () => true,
};
