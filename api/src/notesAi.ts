import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ServiceRequest } from './types.js';

/**
 * Freitext-Notizen aus dem Vertrieb → strukturierte Hinweise.
 * - Mit ANTHROPIC_API_KEY: ein Claude-Call für alle Notizen (JSON-Schema im Prompt), Ergebnis gecacht.
 * - Ohne Key: regelbasierter Fallback (Schlüsselwörter), damit die Demo offline läuft.
 * Wichtig: Die KI schlägt nur vor. Zeitliche Einschränkungen werden erst nach Bestätigung
 * durch den Planer zur harten Regel (Mensch entscheidet, nicht das Modell).
 */

export type NoteCategory = 'time' | 'call' | 'access' | 'animal' | 'other';

export interface NoteInsight {
  requestId: string;
  note: string;
  category: NoteCategory;
  /** Kurzer Hinweis für die Route, z. B. „Vorher anrufen“ */
  hint: string;
  /** Vorgeschlagene Zeit-Einschränkung (HH:MM), nur bei category=time */
  earliest?: string;
  latest?: string;
  source: 'claude' | 'rules';
}

const CACHE_PATH = resolve(process.env.NOTES_CACHE_PATH ?? (process.env.VERCEL ? '/tmp/heizma-notes-cache.json' : resolve(process.cwd(), 'data/notes-cache.json')));
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

type Cache = Record<string, Omit<NoteInsight, 'requestId' | 'note'>>;
function readCache(): Cache {
  try {
    return existsSync(CACHE_PATH) ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache) : {};
  } catch {
    return {};
  }
}
function writeCache(c: Cache) {
  try {
    mkdirSync(dirname(CACHE_PATH), { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify(c, null, 2));
  } catch {
    /* egal – wird neu berechnet */
  }
}

/** Regelbasierter Fallback */
export function ruleInsight(note: string): Omit<NoteInsight, 'requestId' | 'note'> {
  const n = note.toLowerCase();
  const time = n.match(/(?:ab|nach)\s*(\d{1,2})(?::(\d{2}))?\s*uhr/);
  const until = n.match(/(?:bis|vor)\s*(\d{1,2})(?::(\d{2}))?\s*uhr/);
  const hh = (h: string, m?: string) => `${h.padStart(2, '0')}:${m ?? '00'}`;
  if (/vormittag/.test(n)) return { category: 'time', hint: 'Nur vormittags', latest: '12:00', source: 'rules' };
  if (/nachmittag/.test(n)) return { category: 'time', hint: 'Nur nachmittags', earliest: '12:00', source: 'rules' };
  if (time || until)
    return {
      category: 'time',
      hint: [time && `ab ${hh(time[1], time[2])}`, until && `bis ${hh(until[1], until[2])}`].filter(Boolean).join(' ') || 'Zeitwunsch',
      earliest: time ? hh(time[1], time[2]) : undefined,
      latest: until ? hh(until[1], until[2]) : undefined,
      source: 'rules',
    };
  if (/anruf|telefon|melden/.test(n)) return { category: 'call', hint: 'Vorher anrufen', source: 'rules' };
  if (/hund|katze|tier/.test(n)) return { category: 'animal', hint: 'Tier am Grundstück', source: 'rules' };
  if (/zufahrt|parken|einfahrt|hof|tor|stiege|klingel/.test(n)) return { category: 'access', hint: 'Zufahrt beachten', source: 'rules' };
  return { category: 'other', hint: note.length > 40 ? `${note.slice(0, 40)}…` : note, source: 'rules' };
}

async function claudeInsights(notes: { key: string; note: string }[]): Promise<Cache> {
  const prompt = `Du bekommst Freitext-Notizen aus dem Vertrieb eines Wärmepumpen-/PV-Installateurs zu Vor-Ort-Besichtigungen.
Extrahiere für jede Notiz:
- category: "time" (zeitliche Einschränkung), "call" (vorher anrufen), "access" (Zufahrt/Parken/Zugang), "animal" (Tiere), "other"
- hint: max. 5 Wörter, deutsch, für den Techniker
- earliest / latest: nur bei "time", Uhrzeit HH:MM (Termin frühestens ab / muss spätestens dann ENDEN). "vormittags" = latest 12:00, "nachmittags" = earliest 12:00. Sonst weglassen.
Erfinde nichts. Antworte NUR mit JSON: {"items":[{"key":"...","category":"...","hint":"...","earliest":"HH:MM","latest":"HH:MM"}]}

Notizen:
${notes.map((x) => `${x.key}: ${x.note}`).join('\n')}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const body = (await res.json()) as { content: { type: string; text?: string }[] };
  const text = body.content.find((c) => c.type === 'text')?.text ?? '';
  const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as { items: (Omit<NoteInsight, 'requestId' | 'note' | 'source'> & { key: string })[] };
  const HHMM = /^\d{2}:\d{2}$/;
  const out: Cache = {};
  for (const it of json.items) {
    if (!['time', 'call', 'access', 'animal', 'other'].includes(it.category)) continue;
    out[it.key] = {
      category: it.category,
      hint: String(it.hint ?? '').slice(0, 60),
      earliest: it.earliest && HHMM.test(it.earliest) ? it.earliest : undefined,
      latest: it.latest && HHMM.test(it.latest) ? it.latest : undefined,
      source: 'claude',
    };
  }
  return out;
}

let pending: Promise<NoteInsight[]> | null = null;

export async function getNoteInsights(requests: ServiceRequest[]): Promise<NoteInsight[]> {
  if (pending) return pending;
  pending = (async () => {
    const cache = readCache();
    const withNotes = requests.filter((r) => r.notes && r.notes.trim());
    const missing = [...new Map(withNotes.map((r) => [hash(r.notes!), r.notes!])).entries()].filter(([k]) => !cache[k] || (cache[k].source === 'rules' && process.env.ANTHROPIC_API_KEY));
    if (missing.length) {
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          Object.assign(cache, await claudeInsights(missing.map(([key, note]) => ({ key, note }))));
        } catch (e) {
          console.warn('[notes] Claude nicht erreichbar, Fallback auf Regeln:', (e as Error).message);
        }
      }
      for (const [k, note] of missing) cache[k] ??= ruleInsight(note);
      writeCache(cache);
    }
    return withNotes.map((r) => ({ requestId: r.id, note: r.notes!, ...(cache[hash(r.notes!)] ?? ruleInsight(r.notes!)) }));
  })();
  try {
    return await pending;
  } finally {
    pending = null;
  }
}
