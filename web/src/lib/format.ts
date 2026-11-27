/**
 * @file      format.ts – Formatierung: Minuten, Tage, Datum, Anlagentyp
 * @layer     Web · Lib (reine Funktionen)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import type { Issue, Severity } from './types';

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
export function formatDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}

export function formatDateTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}:${m[5]}` : iso;
}

/** Uhrzeit eines Zeitstempels in Wiener Zeit, z. B. „14:05“ */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Vienna' });
}

export const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function worstSeverity(issues: Issue[]): Severity | null {
  if (!issues.length) return null;
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])[0].severity;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  error: 'Fehler',
  warning: 'Warnung',
  info: 'Hinweis',
};

/** Anlagentyp aus der API (visitationType) in Klartext */
const VISITATION_LABEL: Record<string, string> = {
  WP: 'Wärmepumpe',
  PV: 'Photovoltaik',
  'WP+PV': 'Wärmepumpe + Photovoltaik',
};
export function visitationLabel(type: string | null | undefined): string {
  return type ? VISITATION_LABEL[type] ?? type : 'Typ unbekannt';
}

/** ISO-Kalenderwoche („KW 48“) zu einem Datum YYYY-MM-DD */
export function isoWeek(iso: string): number {
  const d = new Date(`${iso}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
}

/** Grund ohne Detail: „Nicht zuordenbar (kein Gebiet, > 15 km)“ → „Nicht zuordenbar“, „Keine Koordinaten – zuerst …“ → „Keine Koordinaten“ */
export const reasonGroup = (reason: string) => reason.split(/[:(–]/)[0].trim();
