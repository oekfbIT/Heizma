import type { AvailabilityEntry, Technician } from '@/lib/types';
import type { Escalation } from '@/modules/anfragen/types';

export interface TechnikerData {
  technicians: Technician[];
  availability: AvailabilityEntry[];
  /** Eskalationen zu Außendienstlern (Schlüssel `technicians:<id>:<ziel>`) */
  escalations: Record<string, Escalation>;
}

export type AvailabilityStatus = 'available' | 'blocked' | 'none';

export type EscalationTarget = 'techniker' | 'vertrieb';

export type TechnicanEscalationKey = `technicians:${string}:${EscalationTarget}`;

export interface TechnicianEscalationInput {
  recipient: string;
  message: string;
  affectedRequests: string[];
}
