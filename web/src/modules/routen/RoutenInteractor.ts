import type { ApiService } from '@/core/ApiService';
import { Resource } from '@/core/Resource';
import { formatDay } from '@/lib/format';
import type { DayRoute, Plan } from '@/lib/types';
import type { DayStatus, RequestPlanStatus, RouteGeometry } from './types';

/** Schlüssel für Verstöße, die nicht an einem Stopp hängen */
export const ROUTE_LEVEL = '__route';

/**
 * Routen-Modul: der berechnete Wochenplan, Straßengeometrie, Freigaben und Kalender-Export.
 * Die Hilfsfunktionen sind rein (Plan rein → Werte raus) und dadurch einfach testbar.
 */
export class RoutenInteractor {
  readonly plan: Resource<Plan>;

  constructor(private readonly api: ApiService) {
    this.plan = new Resource(() => api.get<Plan>('/api/plan'));
  }

  resources() {
    return [this.plan];
  }

  // ---------- Lesen & Aufbereiten ----------

  /** Straßengeometrie nur für die ausgewählte Route (spart API-Calls) */
  geometry(technicianId: string, date: string) {
    return this.api.get<RouteGeometry>(`/api/plan/${technicianId}/${date}/geometry`);
  }

  routesOn(plan: Plan, date: string, include: (technicianId: string) => boolean = () => true): DayRoute[] {
    return plan.routes.filter((r) => r.date === date && include(r.technicianId));
  }

  /** Regelverstöße einer Route, gruppiert nach Stopp (bzw. ROUTE_LEVEL) */
  violationsFor(plan: Plan, technicianId: string, date: string): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const rule of plan.verification?.rules ?? [])
      for (const v of rule.violations) {
        if (v.technicianId !== technicianId || v.date !== date) continue;
        const key = v.stopId ?? ROUTE_LEVEL;
        map.set(key, [...(map.get(key) ?? []), v.message]);
      }
    return map;
  }

  exceptionIds(plan: Plan): Set<string> {
    return new Set((plan.verification?.exceptions ?? []).map((e) => e.requestId));
  }

  hasException(plan: Plan, technicianId: string, date: string): boolean {
    return (plan.verification?.exceptions ?? []).some((e) => e.technicianId === technicianId && e.date === date);
  }

  dayStatus(plan: Plan, date: string, include?: (technicianId: string) => boolean): DayStatus {
    const routes = this.routesOn(plan, date, include).filter((r) => r.stops.length);
    const approved = routes.filter((r) => r.approved).length;
    return { total: routes.length, approved, done: routes.length > 0 && approved === routes.length };
  }

  /** „3 offen“, „✓ erledigt“, „keine Routen“ */
  dayStatusLabel(status: DayStatus): string {
    if (status.total === 0) return 'keine Routen';
    return status.done ? '✓ erledigt' : `${status.total - status.approved} offen`;
  }

  /** Wo steht jede Anfrage? Eingeplant (Tag · Person), Warteliste, aus dem Plan genommen, nicht planbar. */
  requestStatuses(plan: Plan, shortName: (technicianId: string) => string): Map<string, RequestPlanStatus> {
    const map = new Map<string, RequestPlanStatus>();
    for (const r of plan.routes)
      for (const s of r.stops) {
        if (s.kind !== 'request') continue;
        const pin = s.manual?.mode === 'pin' ? '📌 ' : '';
        map.set(s.id, {
          planned: true,
          label: `${pin}${formatDay(r.date)} · ${shortName(r.technicianId)}`,
          tone: r.approved ? 'approved' : 'proposed',
          title: `${r.approved ? 'Freigegeben' : 'Vorgeschlagen'}: ${s.start}–${s.end}`,
        });
      }
    for (const u of plan.unassigned) {
      const [label, tone]: [string, RequestPlanStatus['tone']] = u.reason.startsWith('Kapazität')
        ? ['Warteliste', 'waitlist']
        : u.reason.startsWith('Aus dem Plan')
          ? ['Aus dem Plan genommen', 'excluded']
          : ['Nicht planbar', 'unplannable'];
      map.set(u.requestId, { planned: false, label, tone, title: u.reason });
    }
    return map;
  }

  /** Wartet trotz gültiger Daten (nur Kapazität) */
  capacityWaitlist(plan: Plan, requestId: string) {
    return plan.unassigned.filter((x) => x.requestId === requestId && x.reason.startsWith('Kapazität'));
  }

  routeKey(technicianId: string, date: string) {
    return `${technicianId}@${date}`;
  }

  // ---------- Aktionen ----------

  setApproval(keys: string[], approved: boolean) {
    return this.api.send('/api/approvals', approved ? 'POST' : 'DELETE', { keys });
  }

  approveDay(date: string) {
    return this.api.send(`/api/approvals?date=${date}`, 'POST', {});
  }

  downloadIcs(technicianId: string, date: string) {
    return this.api.download(`/api/plan/${technicianId}/${date}/ics`, `route-${technicianId}-${date}.ics`);
  }
}
