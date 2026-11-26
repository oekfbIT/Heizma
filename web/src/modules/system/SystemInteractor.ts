/**
 * @file      SystemInteractor.ts – Modul System: Meta, Kennzahlen, Prognose, lokale DB, Protokoll, Reset
 * @layer     Web · Modul-Interactor
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import type { ApiService } from '@/core/ApiService';
import { Resource } from '@/core/Resource';
import { formatDay } from '@/lib/format';
import type { AppConfig, LocalDb, LogCategory, LogEntry, Forecast, LogItem, Meta, Overview, Stammdaten } from './types';

/**
 * System-Modul: Laufzeit-Konfiguration, Kennzahlen, lokale Korrekturen und der
 * gesamte Datenbestand als Read-Model für die generischen Stammdaten-Seiten.
 */
export class SystemInteractor {
  /** Gesamter Datenbestand (alle Module) – nur für modulübergreifende Seiten */
  readonly stammdaten: Resource<Stammdaten>;
  readonly overview: Resource<Overview>;
  /** Prognose: Wochen bis die Warteliste abgearbeitet ist */
  readonly forecast: Resource<Forecast>;
  readonly meta: Resource<Meta>;
  readonly config: Resource<AppConfig>;
  readonly localDb: Resource<LocalDb>;
  readonly log: Resource<LogEntry[]>;

  constructor(private readonly api: ApiService) {
    this.stammdaten = new Resource(() => api.get<Stammdaten>('/api/stammdaten'));
    this.overview = new Resource(() => api.get<Overview>('/api/overview'));
    this.forecast = new Resource(() => api.get<Forecast>('/api/forecast'));
    this.meta = new Resource(() => api.get<Meta>('/api/meta'));
    this.config = new Resource(() => api.get<AppConfig>('/api/config'));
    this.localDb = new Resource(() => api.get<LocalDb>('/api/local-db'));
    this.log = new Resource(async () => (await api.get<{ entries: LogEntry[] }>('/api/log')).entries);
  }

  resources() {
    return [this.stammdaten, this.overview, this.forecast, this.meta, this.config, this.localDb, this.log];
  }

  /** „Mo 23.11. – Fr 27.11.“ */
  periodLabel(range: { from: string; to: string }): string {
    return `${formatDay(range.from)} – ${formatDay(range.to)}`;
  }

  sourceLabel(source: 'live' | 'mock'): string {
    return source === 'live' ? 'Heizma Case-Study-API' : 'Mock-Daten (offline)';
  }

  /** Heizma-API neu laden (serverseitiger Cache) */
  reloadSource() {
    this.api.clear();
    return this.api.send('/api/reload', 'POST');
  }

  /** Demo auf den Ausgangsstand: alle lokalen Korrekturen, Freigaben, Eingriffe, Eskalationen und das Protokoll löschen */
  resetDemo() {
    return this.api.send('/api/local-db/reset', 'POST', {});
  }

  /**
   * Protokoll für die Ansicht aufbereiten. `name` liefert den Kurznamen einer Person („Nord“).
   * Doppelte Einträge (Anfrage wird bei Freigabe zum Termin) werden ausgeblendet – die Freigabe steht schon da.
   */
  logItems(entries: LogEntry[], name: (technicianId: string) => string): LogItem[] {
    return entries.filter((e) => !HIDDEN_ACTIONS.has(e.action)).map((e, i) => describeLogEntry(e, name, i));
  }

  logCounts(items: LogItem[]): Record<LogCategory | 'all', number> {
    const counts = { all: items.length, freigabe: 0, planung: 0, eskalation: 0, korrektur: 0, notiz: 0, system: 0 };
    for (const it of items) counts[it.category]++;
    return counts;
  }

  /** Nur für Tests: Freigaben, Entscheidungen, Notizen, Eskalationen löschen – Korrekturen bleiben */
  resetPlanning() {
    return this.api.send('/api/local-db/reset?scope=planning', 'POST', {});
  }
}

export const LOG_CATEGORY_LABEL: Record<LogCategory, string> = {
  freigabe: 'Freigaben',
  planung: 'Eingriffe',
  eskalation: 'Eskalationen',
  korrektur: 'Korrekturen',
  notiz: 'Notiz-Hinweise',
  system: 'System',
};

const HIDDEN_ACTIONS = new Set(['termin', 'termin-zurueck']);

const DECISION_LABEL: Record<string, string> = {
  fixiert: 'Fixiert',
  'aus-plan': 'Aus dem Plan genommen',
  vorgezogen: 'Vorgezogen',
  getauscht: 'Getauscht',
  zurueckgesetzt: 'Eingriff aufgehoben',
};

const ESCALATION_LABEL: Record<string, string> = {
  customer_delay: 'Kunde informiert',
  internal: 'Intern eskaliert',
  technician_request: 'Außendienst angefragt',
};

const FIELD_LABEL: Record<string, string> = {
  address: 'Adresse',
  lat: 'Koordinaten',
  lng: 'Koordinaten',
  visitationType: 'Typ',
  durationMinutes: 'Dauer',
  customerAvailableFrom: 'Kunde ab',
  notes: 'Notiz',
  name: 'Name',
  region: 'Gebiet',
};

type Ref = { technicianId?: string; date?: string } | null | undefined;

/** Einen Rohdatensatz in Text für die Ansicht übersetzen (rein, ohne Zugriff auf Daten) */
export function describeLogEntry(e: LogEntry, name: (technicianId: string) => string, index = 0): LogItem {
  const c = e.changes ?? {};
  const slot = (r: Ref) => (r?.technicianId && r.date ? `${name(r.technicianId)} · ${formatDay(r.date)}` : r?.technicianId ? name(r.technicianId) : '');
  const request = (id: string) => ({ label: id, to: `/stammdaten/anfragen/${encodeURIComponent(id)}` });
  const technician = (id: string) => ({ label: name(id), to: `/stammdaten/techniker/${encodeURIComponent(id)}` });
  const base = { key: `${e.at}-${e.id}-${e.action}-${index}`, at: e.at, reason: e.reason };

  if (e.action === 'approve' || e.action === 'unapprove') {
    const [techId, date] = e.id.split('@');
    const stops = Array.isArray(c.stops) ? c.stops.length : 0;
    return {
      ...base,
      category: 'freigabe',
      action: e.action === 'approve' ? 'Route freigegeben' : 'Freigabe zurückgenommen',
      target: { label: slot({ technicianId: techId, date }), to: '/planer' },
      detail: e.action === 'approve' ? `${stops} ${stops === 1 ? 'Stopp' : 'Stopps'}` : '',
    };
  }
  if (DECISION_LABEL[e.action]) {
    const after = c.after as (Ref & { replaces?: string }) | undefined;
    const before = c.before as Ref;
    const detail =
      e.action === 'zurueckgesetzt'
        ? before ? `war: ${slot(before) || 'ohne Person'}` : ''
        : e.action === 'getauscht' && after?.replaces
          ? `→ ${slot(after)} statt ${after.replaces}`
          : slot(after) ? `→ ${slot(after)}` : '';
    return { ...base, category: 'planung', action: DECISION_LABEL[e.action], target: request(e.id), detail, exception: c.override === true };
  }
  if (e.action === 'escalate' || e.action === 'eskalation-zurueck') {
    const techKey = /^technicians:([^:]+):/.exec(e.id);
    const type = String(c.type ?? '');
    return {
      ...base,
      category: 'eskalation',
      action: e.action === 'escalate' ? (ESCALATION_LABEL[type] ?? 'Eskaliert') : 'Eskalation zurückgenommen',
      target: techKey ? technician(techKey[1]) : request(e.id),
      detail: c.newDate ? `neuer Termin ab ${formatDay(String(c.newDate))}` : '',
    };
  }
  if (e.action === 'update' || e.action === 'reset') {
    const fields = [...new Set(Object.keys(c).map((k) => (k === 'region' && Array.isArray(c.region) ? `Gebiet (${c.region.length} Eckpunkte)` : FIELD_LABEL[k] ?? k)))];
    return {
      ...base,
      category: 'korrektur',
      action: e.action === 'update' ? 'Daten korrigiert' : 'Original wiederhergestellt',
      target: e.entity === 'technicians' ? technician(e.id) : e.entity === 'requests' ? request(e.id) : { label: e.id, to: null },
      detail: fields.join(', '),
    };
  }
  if (e.action === 'notiz-bestaetigt' || e.action === 'notiz-zurueck') {
    const parts = [c.earliest && `ab ${c.earliest}`, c.latest && `bis ${c.latest}`].filter(Boolean);
    return {
      ...base,
      category: 'notiz',
      action: e.action === 'notiz-bestaetigt' ? 'Zeitgrenze übernommen' : 'Zeitgrenze zurückgenommen',
      target: request(e.id),
      detail: parts.join(' '),
    };
  }
  if (e.action === 'demo-reset') {
    return { ...base, category: 'system', action: 'Demo zurückgesetzt', target: { label: 'Alle Daten', to: null }, detail: 'Ausgangsstand der Heizma-API' };
  }
  return { ...base, category: 'system', action: e.action, target: { label: e.id, to: null }, detail: '' };
}
