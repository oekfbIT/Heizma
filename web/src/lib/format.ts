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

/** Feste Farbpalette pro Techniker (Karte + Sidebar) */
const ROUTE_COLORS = ['#4da547', '#1a73e8', '#e8710a', '#9334e6', '#d93025', '#12b5cb', '#f9ab00', '#5f6368'];
export function technicianColor(technicianId: string, ids: string[]): string {
  const index = Math.max(0, ids.indexOf(technicianId));
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
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
