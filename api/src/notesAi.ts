/**
 * @file      notesAi.ts – KI: Vertriebsnotizen (Freitext) → strukturierte Hinweise für Route und Planer
 * @layer     Backend · Infrastruktur (optional I/O: OpenAI · Datei-Cache api/data/notes-cache.json)
 * @einstieg  getNoteInsights(requests) · notesAiEnabled()
 * @genutzt   index.ts → GET /api/notes → Web: Hinweise in StopTimeline/StopDetailsModal
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 *
 * KI · SICHERHEIT: Das Modell schlägt nur vor. Planungsrelevant werden Zeitgrenzen erst nach Bestätigung
 *                   (POST /api/notes/:id/confirm). Für die Planung selbst gilt timeWish.ts (deterministisch).
 * DATEN: 37 Freitext-Notizen im Datensatz. Cache-Schlüssel = SHA1 der Notiz → gleiche Notiz = ein Aufruf.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { ServiceRequest } from './types.js';
import { parseTimeWish } from './timeWish.js';

/**
 * Freitext-Notizen aus dem Vertrieb → strukturierte Hinweise.
 * - Mit OPENAI_API_KEY: ein OpenAI-Call für alle Notizen (JSON-Modus), Ergebnis gecacht.
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
  source: 'ai' | 'rules';
}

const CACHE_PATH = resolve(process.env.NOTES_CACHE_PATH ?? (process.env.VERCEL ? '/tmp/heizma-notes-cache.json' : resolve(process.cwd(), 'data/notes-cache.json')));
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const aiEnabled = () => !!process.env.OPENAI_API_KEY;
export const notesAiEnabled = aiEnabled;
const hash = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 12);

// MARK: - Cache

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

// MARK: - Regelbasierter Fallback (ohne API-Key / bei Fehlern)

/** Regelbasierter Fallback */
function ruleInsight(note: string): Omit<NoteInsight, 'requestId' | 'note'> {
  const n = note.toLowerCase();
  // Zeitwünsche: derselbe Parser wie in der Planung (timeWish.ts) – eine Quelle, keine zwei Regelwerke
  const wish = parseTimeWish(note);
  if (wish) return { category: 'time', hint: wish.hint, earliest: wish.earliest, latest: wish.latest, source: 'rules' };
  if (/anruf|telefon|melden/.test(n)) return { category: 'call', hint: 'Vorher anrufen', source: 'rules' };
  if (/hund|katze|tier/.test(n)) return { category: 'animal', hint: 'Tier am Grundstück', source: 'rules' };
  if (/zufahrt|parken|einfahrt|hof|tor|stiege|klingel/.test(n)) return { category: 'access', hint: 'Zufahrt beachten', source: 'rules' };
  return { category: 'other', hint: note.length > 40 ? `${note.slice(0, 40)}…` : note, source: 'rules' };
}

// MARK: - KI-Aufruf (ein Call für alle fehlenden Notizen)

/** KI: temperature 0 + JSON-Modus; Antwort wird streng geprüft (Kategorie-Whitelist, HH:MM-Format). */
async function aiInsights(notes: { key: string; note: string }[]): Promise<Cache> {
  const prompt = `Du bekommst Freitext-Notizen aus dem Vertrieb eines Wärmepumpen-/PV-Installateurs zu Vor-Ort-Besichtigungen.
Extrahiere für jede Notiz:
- category: "time" (zeitliche Einschränkung), "call" (vorher anrufen), "access" (Zufahrt/Parken/Zugang), "animal" (Tiere), "other"
- hint: max. 5 Wörter, deutsch, für den Techniker
- earliest / latest: nur bei "time", Uhrzeit HH:MM (Termin frühestens ab / muss spätestens dann ENDEN). "vormittags" = latest 12:00, "nachmittags" = earliest 12:00. Sonst weglassen.
Erfinde nichts. Antworte NUR mit JSON: {"items":[{"key":"...","category":"...","hint":"...","earliest":"HH:MM","latest":"HH:MM"}]}

Notizen:
${notes.map((x) => `${x.key}: ${x.note}`).join('\n')}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const body = (await res.json()) as { choices: { message: { content: string | null } }[] };
  const text = body.choices[0]?.message?.content ?? '';
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
      source: 'ai',
    };
  }
  return out;
}

// MARK: - EINSTIEG

// Parallele Aufrufe teilen sich einen laufenden Ladevorgang
let pending: Promise<NoteInsight[]> | null = null;

export async function getNoteInsights(requests: ServiceRequest[]): Promise<NoteInsight[]> {
  if (pending) return pending;
  pending = (async () => {
    const cache = readCache();
    const withNotes = requests.filter((r) => r.notes && r.notes.trim());
    const missing = [...new Map(withNotes.map((r) => [hash(r.notes!), r.notes!])).entries()].filter(([k]) => !cache[k] || (cache[k].source === 'rules' && aiEnabled()));
    if (missing.length) {
      if (aiEnabled()) {
        try {
          Object.assign(cache, await aiInsights(missing.map(([key, note]) => ({ key, note }))));
        } catch (e) {
          console.warn('[notes] OpenAI nicht erreichbar, Fallback auf Regeln:', (e as Error).message);
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
