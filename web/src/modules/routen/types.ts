import type { TravelResult } from '@/lib/types';

export interface RouteGeometry {
  points: { lat: number; lng: number }[];
  legs: TravelResult[];
}

export type PlanStatusTone = 'approved' | 'proposed' | 'waitlist' | 'excluded' | 'unplannable';

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
