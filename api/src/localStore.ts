import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Appointment, Dataset, ServiceRequest, Technician } from './types.js';

/**
 * Lokale Korrekturen ("Overrides") – die Case-Study-API ist read-only.
 * Änderungen aus der Edit-Ansicht werden per PATCH hier gespeichert (JSON-Datei)
 * und vor Validierung & Planung über die API-Daten gelegt. Original bleibt unverändert.
 * In Produktion würde dieselbe Schnittstelle ins CRM zurückschreiben.
 */

export type EntityKey = 'requests' | 'technicians' | 'appointments';
type Patch = Record<string, unknown>;

export type EscalationType = 'customer_delay' | 'internal';

export interface Escalation {
  type: EscalationType;
  at: string;
  /** Neuer Terminvorschlag (nur bei Kundenbenachrichtigung) */
  newDate?: string;
  recipient: string;
  message: string;
}

export interface LocalDb {
  version: 1;
  updatedAt: string | null;
  overrides: Record<EntityKey, Record<string, Patch>>;
  /** Eskalationen zu nicht eingeplanten Anfragen (simuliert – es wird nichts versendet) */
  escalations: Record<string, Escalation>;
  log: { at: string; entity: EntityKey | 'escalations'; id: string; action: 'update' | 'reset' | 'escalate'; changes?: Patch }[];
}

const DB_PATH = resolve(
  process.env.LOCAL_DB_PATH ?? (process.env.VERCEL ? '/tmp/heizma-local-db.json' : resolve(process.cwd(), 'data/local-db.json')),
);

const empty = (): LocalDb => ({ version: 1, updatedAt: null, overrides: { requests: {}, technicians: {}, appointments: {} }, escalations: {}, log: [] });

let db: LocalDb | null = null;
let revision = 0;

function load(): LocalDb {
  if (db) return db;
  try {
    db = existsSync(DB_PATH) ? (JSON.parse(readFileSync(DB_PATH, 'utf8')) as LocalDb) : empty();
  } catch {
    db = empty();
  }
  db.overrides = { ...empty().overrides, ...db.overrides };
  db.log ??= [];
  db.escalations ??= {};
  return db;
}

function persist() {
  const d = load();
  d.updatedAt = new Date().toISOString();
  revision++;
  try {
    mkdirSync(dirname(DB_PATH), { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(d, null, 2));
  } catch (e) {
    console.warn('[localStore] konnte nicht schreiben:', (e as Error).message);
  }
}

// ---- Erlaubte Felder & Typprüfung ----

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

type Parser = (v: unknown) => unknown;
const FIELDS: Record<EntityKey, Record<string, Parser>> = {
  requests: {
    address: (v) => String(v ?? '').trim(),
    lat: (v) => num(v),
    lng: (v) => num(v),
    visitationType: (v) => (v === '' || v === null || v === '—' ? null : String(v)),
    durationMinutes: (v) => Number(v),
    customerAvailableFrom: (v) => (v === '' || v === null || v === '—' ? null : String(v).trim()),
    notes: (v) => (v === '' || v === '—' ? null : String(v)),
  },
  technicians: {
    name: (v) => String(v ?? '').trim(),
    // Gebiet als Text: eine Zeile pro Eckpunkt "lat, lng"
    region: (v) =>
      Array.isArray(v)
        ? v
        : String(v ?? '')
            .split('\n')
            .map((l) => l.split(',').map((x) => Number(x.trim())))
            .filter((p) => p.length === 2 && p.every(Number.isFinite))
            .map(([lat, lng]) => ({ lat, lng })),
  },
  // Fixe Termine sind laut Case nicht verschiebbar → bewusst nicht bearbeitbar
  appointments: {},
};

export class ValidationError extends Error {}

function check(entity: EntityKey, patch: Patch) {
  if (entity === 'requests') {
    for (const k of ['lat', 'lng'] as const) {
      const v = patch[k];
      if (v !== undefined && v !== null && !Number.isFinite(v as number)) throw new ValidationError(`${k} muss eine Zahl sein`);
    }
    if (typeof patch.lat === 'number' && (patch.lat < 46 || patch.lat > 49.1)) throw new ValidationError('lat liegt nicht in Österreich (46–49,1)');
    if (typeof patch.lng === 'number' && (patch.lng < 9.4 || patch.lng > 17.2)) throw new ValidationError('lng liegt nicht in Österreich (9,4–17,2)');
    if (patch.visitationType != null && !['WP', 'PV', 'WP+PV'].includes(patch.visitationType as string))
      throw new ValidationError('Typ muss WP, PV oder WP+PV sein');
    if (patch.durationMinutes !== undefined && !(Number(patch.durationMinutes) > 0)) throw new ValidationError('Dauer muss > 0 sein');
    if (patch.customerAvailableFrom != null && !HHMM.test(patch.customerAvailableFrom as string))
      throw new ValidationError('Uhrzeit im Format HH:MM (00:00–23:59)');
  }
  if (entity === 'technicians' && Array.isArray(patch.region) && patch.region.length > 0 && patch.region.length < 3)
    throw new ValidationError('Gebiet braucht mindestens 3 Eckpunkte');
}

// ---- Öffentliche API ----

export function updateEntity(entity: EntityKey, id: string, input: Patch): Patch {
  const parsers = FIELDS[entity];
  if (!parsers) throw new ValidationError(`Unbekannter Bereich ${entity}`);
  const patch: Patch = {};
  for (const [k, v] of Object.entries(input)) {
    if (!parsers[k]) throw new ValidationError(`Feld „${k}“ ist nicht bearbeitbar`);
    patch[k] = parsers[k](v);
  }
  if (!Object.keys(patch).length) throw new ValidationError('Keine Änderungen');
  check(entity, patch);
  const d = load();
  d.overrides[entity][id] = { ...(d.overrides[entity][id] ?? {}), ...patch };
  d.log.push({ at: new Date().toISOString(), entity, id, action: 'update', changes: patch });
  persist();
  return d.overrides[entity][id];
}

export function resetEntity(entity: EntityKey, id: string) {
  const d = load();
  delete d.overrides[entity]?.[id];
  d.log.push({ at: new Date().toISOString(), entity, id, action: 'reset' });
  persist();
}

export function resetAll() {
  db = empty();
  persist();
}

export function dumpDb(): LocalDb & { path: string } {
  return { ...load(), path: DB_PATH };
}

export function editableFields(): Record<EntityKey, string[]> {
  return Object.fromEntries(Object.entries(FIELDS).map(([k, v]) => [k, Object.keys(v)])) as Record<EntityKey, string[]>;
}

/** API-Daten + lokale Korrekturen. loadedAt enthält die Revision → Plan wird neu berechnet. */
export function applyOverrides(data: Dataset): Dataset & { overridden: Record<EntityKey, string[]> } {
  const o = load().overrides;
  const merge = <T extends { id: string }>(list: T[], key: EntityKey): T[] =>
    list.map((item) => (o[key][item.id] ? ({ ...item, ...o[key][item.id] } as T) : item));
  return {
    ...data,
    requests: merge<ServiceRequest>(data.requests, 'requests'),
    technicians: merge<Technician>(data.technicians, 'technicians'),
    appointments: merge<Appointment>(data.appointments, 'appointments'),
    loadedAt: `${data.loadedAt}#r${revision}`,
    overridden: { requests: Object.keys(o.requests), technicians: Object.keys(o.technicians), appointments: Object.keys(o.appointments) },
  };
}

// ---- Eskalationen ----

export function escalate(requestId: string, input: { type?: string; newDate?: string; recipient?: string; message?: string }, planTo: string): Escalation {
  const type = input.type as EscalationType;
  if (!['customer_delay', 'internal'].includes(type)) throw new ValidationError('type muss customer_delay oder internal sein');
  const message = String(input.message ?? '').trim();
  if (message.length < 10) throw new ValidationError('Nachricht fehlt');
  let newDate: string | undefined;
  if (type === 'customer_delay') {
    newDate = String(input.newDate ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) throw new ValidationError('Neuer Termin im Format YYYY-MM-DD');
    if (newDate <= planTo) throw new ValidationError(`Neuer Termin muss nach dem Planungszeitraum (${planTo}) liegen`);
  }
  const escalation: Escalation = {
    type,
    at: new Date().toISOString(),
    newDate,
    recipient: String(input.recipient ?? (type === 'customer_delay' ? 'Kunde' : 'Disposition')),
    message,
  };
  const d = load();
  d.escalations[requestId] = escalation;
  d.log.push({ at: escalation.at, entity: 'escalations', id: requestId, action: 'escalate', changes: { type, newDate } });
  persist();
  return escalation;
}

export function withdrawEscalation(requestId: string) {
  const d = load();
  delete d.escalations[requestId];
  persist();
}

export function listEscalations(): Record<string, Escalation> {
  return load().escalations;
}
