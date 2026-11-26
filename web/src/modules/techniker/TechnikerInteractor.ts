/**
 * @file      TechnikerInteractor.ts – Modul Techniker: Personen, Verfügbarkeiten, Farben, Gebiets-Vorlagen, Eskalationen
 * @layer     Web · Modul-Interactor
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
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

  // MARK: - Lesen & Aufbereiten
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

  // MARK: - Schreiben (nur eigene Daten; Aktualisieren übernimmt der CoreInteractor)
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
/** Vorlage für ein Einsatzgebiet (Dropdown in der Detailansicht) */
export interface RegionPreset {
  value: string;
  label: string;
  polygon: { lat: number; lng: number }[];
}

/** Kreis um einen Punkt als Polygon (12 Eckpunkte, ausreichend für Punkt-in-Polygon) */
export function circlePolygon(center: { lat: number; lng: number }, radiusKm: number, points = 12): { lat: number; lng: number }[] {
  const dLat = radiusKm / 111.32;
  const dLng = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return Array.from({ length: points }, (_, i) => {
    const a = (2 * Math.PI * i) / points;
    return { lat: +(center.lat + dLat * Math.sin(a)).toFixed(4), lng: +(center.lng + dLng * Math.cos(a)).toFixed(4) };
  });
}

/** Punkt-in-Polygon (Ray Casting) – gleiche Logik wie in der API */
export function inPolygon(p: { lat: number; lng: number }, poly: { lat: number; lng: number }[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) inside = !inside;
  }
  return inside;
}

/** Vorlagen: Gebiet einer anderen Person übernehmen oder Umkreis um den Wohnort */
export function regionPresets(tech: Technician, all: Technician[]): RegionPreset[] {
  const others = all
    .filter((t) => t.id !== tech.id && (t.region?.length ?? 0) >= 3)
    .map((t) => ({ value: `copy:${t.id}`, label: `Gebiet von ${regionName(t)} übernehmen`, polygon: t.region }));
  const circles = [30, 50, 80].map((km) => ({ value: `circle:${km}`, label: `Umkreis ${km} km um ${tech.home.label}`, polygon: circlePolygon(tech.home, km) }));
  return [...circles, ...others];
}

/** Text-Format des Gebiets-Felds: eine Zeile pro Eckpunkt „lat, lng“ */
export const serializeRegion = (poly: { lat: number; lng: number }[]) => poly.map((p) => `${p.lat}, ${p.lng}`).join('\n');

/** Text des Gebiets-Felds → Eckpunkte (ungültige Zeilen werden ignoriert) */
export function parseRegion(text: string): { lat: number; lng: number }[] {
  return text
    .split('\n')
    .map((l) => l.split(',').map((x) => Number(x.trim())))
    .filter((p) => p.length === 2 && p.every((n) => Number.isFinite(n)))
    .map(([lat, lng]) => ({ lat, lng }));
}

export const regionName = (t: Technician) => t.name.replace(/^Techniker\s+/i, '');

const escalationKey = (id: string, target: EscalationTarget): TechnicanEscalationKey => `technicians:${id}:${target}`;
