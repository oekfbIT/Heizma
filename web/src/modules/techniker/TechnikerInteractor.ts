import type { ApiService } from '@/core/ApiService';
import { Resource } from '@/core/Resource';
import type { Technician } from '@/lib/types';
import type { Stammdaten } from '@/modules/system/types';
import { routeColor } from '@/ui/theme';
import type { AvailabilityStatus, EscalationTarget, TechnicanEscalationKey, TechnikerData, TechnicianEscalationInput } from './types';

/**
 * Techniker-Modul: lädt nur die Außendienst-Daten (Personen, Verfügbarkeiten, Eskalationen)
 * und bereitet sie für Views auf – Views formatieren nichts selbst.
 */
export class TechnikerInteractor {
  readonly data: Resource<TechnikerData>;
  private colorCache: { source: Technician[]; colors: Record<string, string> } | null = null;
  private daysCache: { source: TechnikerData['availability']; days: string[] } | null = null;

  constructor(private readonly api: ApiService) {
    this.data = new Resource(async () => {
      const s = await api.get<Stammdaten>('/api/stammdaten');
      return { technicians: s.technicians, availability: s.availability, escalations: s.escalations ?? {} };
    });
  }

  resources() {
    return [this.data];
  }

  // ---------- Lesen & Aufbereiten ----------

  list(): Technician[] {
    return this.data.getState().data?.technicians ?? [];
  }

  byId(id: string): Technician | undefined {
    return this.list().find((t) => t.id === id);
  }

  /** „Techniker Nord“ */
  getName(id: string): string {
    return this.byId(id)?.name ?? id;
  }

  /** „Nord“ – der Name ist ein Pseudonym = Region */
  getShortName(id: string): string {
    const t = this.byId(id);
    return t ? regionName(t) : id;
  }

  /** „4020 Linz“ */
  getHome(id: string): string {
    return this.byId(id)?.home.label ?? '—';
  }

  /** „Techniker Nord · 4020 Linz“ */
  getLabel(id: string): string {
    return `${this.getName(id)} · ${this.getHome(id)}`;
  }

  /** Feste Farbe je Person (Karte + Liste), stabil solange sich die Personenliste nicht ändert */
  colors(techs: Technician[] = this.list()): Record<string, string> {
    if (this.colorCache?.source !== techs) {
      this.colorCache = { source: techs, colors: Object.fromEntries(techs.map((t, i) => [t.id, routeColor(i)])) };
    }
    return this.colorCache.colors;
  }

  /** Alle Tage mit Verfügbarkeitseinträgen, sortiert */
  days(): string[] {
    const availability = this.data.getState().data?.availability ?? [];
    if (this.daysCache?.source !== availability) {
      this.daysCache = { source: availability, days: [...new Set(availability.map((a) => a.date))].sort() };
    }
    return this.daysCache.days;
  }

  statusOn(id: string, day: string): AvailabilityStatus {
    const entry = this.data.getState().data?.availability.find((a) => a.technicianId === id && a.date === day);
    if (!entry) return 'none';
    return entry.blocked ? 'blocked' : 'available';
  }

  /** „07:00–19:00“, „gesperrt“ oder „nicht verfügbar“ */
  getAvailability(id: string, day: string): string {
    const entry = this.data.getState().data?.availability.find((a) => a.technicianId === id && a.date === day);
    if (!entry) return 'nicht verfügbar';
    return entry.blocked ? 'gesperrt' : `${entry.start}–${entry.end}`;
  }

  escalation(id: string, target: EscalationTarget) {
    return this.data.getState().data?.escalations[escalationKey(id, target)];
  }

  // ---------- Schreiben (nur eigene Daten; Aktualisieren übernimmt der CoreInteractor) ----------

  update(id: string, changes: Record<string, string>) {
    return this.api.send(`/api/stammdaten/technicians/${encodeURIComponent(id)}`, 'PATCH', changes);
  }

  resetToOriginal(id: string) {
    return this.api.send(`/api/stammdaten/technicians/${encodeURIComponent(id)}`, 'DELETE');
  }

  escalate(id: string, target: EscalationTarget, input: TechnicianEscalationInput) {
    return this.api.send(`/api/escalations/technicians/${id}/${target}`, 'POST', input);
  }

  withdrawEscalation(id: string, target: EscalationTarget) {
    return this.api.send(`/api/escalations/technicians/${id}/${target}`, 'DELETE');
  }
}

/** Ein Außendienstler = ein Einsatzgebiet. „Techniker Ost“ → „Ost“ */
export const regionName = (t: Technician) => t.name.replace(/^Techniker\s+/i, '');

export const escalationKey = (id: string, target: EscalationTarget): TechnicanEscalationKey => `technicians:${id}:${target}`;
