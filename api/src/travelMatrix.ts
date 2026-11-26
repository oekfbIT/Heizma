import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config.js';
import { estimateTravelMinutes, hasCoords } from './geo.js';
import { travelPathRaw } from './heizmaClient.js';
import type { Dataset, LatLng } from './types.js';
import { eligibleTechnicians } from './validation.js';

/**
 * Fahrzeitmatrix aus der Heizma-API (/travel/path).
 *
 * Idee: Wir brauchen nur Paare, die in einer Route überhaupt nebeneinander liegen können –
 * also Punkte, die sich mindestens einen zuständigen Techniker teilen (Wohnort, Anfragen, fixe Termine).
 * Diese Paare werden zu Pfaden mit max. 14 Punkten verkettet (13 Fahrten pro Call statt 1),
 * parallel geladen und auf Platte gecacht. Fehlt ein Paar, fällt es auf die Luftlinien-Schätzung
 * zurück und wird als "geschätzt" markiert – der Validator weist das aus.
 *
 * Annahme (Trade-off): Fahrzeit A→B ≈ B→A. Halbiert die Calls; Abweichung auf Landstraßen gering.
 */

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

const CACHE_PATH = resolve(
  process.env.TRAVEL_CACHE_PATH ?? (process.env.VERCEL ? '/tmp/heizma-travel-cache.json' : resolve(process.cwd(), 'data/travel-cache.json')),
);

type CacheFile = { version: 1; pairs: Record<string, { minutes: number; km: number; estimated: boolean }> };

const ptKey = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
const pairKey = (a: LatLng, b: LatLng) => {
  const ka = ptKey(a), kb = ptKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

function readCache(): CacheFile {
  try {
    if (existsSync(CACHE_PATH)) return JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as CacheFile;
  } catch {
    /* kaputter Cache → neu aufbauen */
  }
  return { version: 1, pairs: {} };
}

function writeCache(c: CacheFile) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(c));
  } catch (e) {
    console.warn('[travel] Cache nicht schreibbar:', (e as Error).message);
  }
}

/** Alle Punktpaare, die in einer Route benachbart sein können */
export function neededPairs(data: Dataset): Map<string, [LatLng, LatLng]> {
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

let current: { key: string; lookup: TravelLookup; stats: MatrixStats } | null = null;
let building: Promise<void> | null = null;

/** Matrix für den Datenstand laden/aufbauen (fehlende Paare werden nachgeladen) */
export async function getTravelMatrix(data: Dataset, opts: { log?: boolean } = {}): Promise<{ lookup: TravelLookup; stats: MatrixStats }> {
  const pairs = neededPairs(data);
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
        await pool(paths, 4, async (path) => {
          try {
            const legs = await travelPathRaw(path);
            apiCalls++;
            legs.forEach((leg, i) => {
              cache.pairs[pairKey(path[i], path[i + 1])] = { minutes: leg.minutes, km: leg.km, estimated: leg.estimated };
            });
            if (opts.log && apiCalls % 25 === 0) console.log(`[travel] ${apiCalls}/${paths.length}`);
          } catch (e) {
            failed++;
            if (failed <= 3) console.warn('[travel] Call fehlgeschlagen, Schätzung als Fallback:', (e as Error).message);
          }
        });
        writeCache(cache);
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

export function resetTravelMatrix() {
  current = null;
}
