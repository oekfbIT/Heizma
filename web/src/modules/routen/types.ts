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

export type PlanStatusTone = 'approved' | 'proposed' | 'waitlist' | 'preplanned' | 'excluded' | 'review' | 'unplannable';

/** Wo steht eine Anfrage im Plan – fertig für einen Chip in der Liste */
export interface RequestPlanStatus {
  planned: boolean;
  label: string;
  tone: PlanStatusTone;
  title: string;
}

export interface DayStatus {
  total: number;
  approved: number;
  done: boolean;
}
