/**
 * @file      types.ts – Typen des Routen-Moduls
 * @layer     Web · Modul-Typen
 * @siehe     docs/02-architektur.md · docs/10-code-navigation.md
 */
import type { TravelResult } from '@/lib/types';

export interface RouteGeometry {
  points: { lat: number; lng: number }[];
  legs: TravelResult[];
}

export type PlanStatusTone = 'approved' | 'proposed' | 'waitlist' | 'preplanned' | 'excluded' | 'unplannable';

/** Wo steht eine Anfrage im Plan – fertig für einen Chip in der Liste */
export interface RequestPlanStatus {
  planned: boolean;
  label: string;
  tone: PlanStatusTone;
  title: string;
}

/**
 * Bilanz aller Anfragen: jede Anfrage steht in genau einem Topf, die Töpfe ergeben zusammen `total`.
 * Einzige Quelle für alle Zähler der Oberfläche (Übersicht, Prognose, Planer, Liste) – so passen die Zahlen überall zusammen.
 */
export interface PlanBalance {
  total: number;
  /** Diese Woche in einer Route (inkl. freigegeben) */
  thisWeek: number;
  /** davon schon freigegeben */
  approved: number;
  /** Warteliste mit vorläufigem Platz in einer Folgewoche */
  preplanned: number;
  preplannedByWeek: { week: number; count: number }[];
  /** Warteliste ohne Platz in den nächsten Wochen */
  waitlist: number;
  /** Braucht Klärung (Datenfehler, nicht zuordenbar, niemand verfügbar, passt in keinen Tag) */
  unplannable: number;
  unplannableByReason: { reason: string; count: number }[];
  excluded: number;
}

export interface DayStatus {
  total: number;
  approved: number;
  done: boolean;
}
