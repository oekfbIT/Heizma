import type { DecisionMode, ServiceRequest } from '@/lib/types';

export interface Escalation {
  type: 'customer_delay' | 'internal' | 'technician_request';
  affectedRequests?: string[];
  at: string;
  newDate?: string;
  recipient: string;
  message: string;
}

export interface NoteInsight {
  requestId: string;
  note: string;
  category: string;
  hint: string;
  earliest?: string;
  latest?: string;
  source: 'claude' | 'rules';
}

export interface NoteInfo {
  insights: NoteInsight[];
  confirmed: Record<string, { earliest?: string; latest?: string; confirmedAt: string }>;
  ai: boolean;
}

export interface NoteConstraint {
  earliest?: string;
  latest?: string;
}

export interface GeoResult {
  lat: number;
  lng: number;
  address: string;
  source: 'google' | 'osm';
  precision: 'exact' | 'street' | 'town';
}

/** Planer-Entscheidung zu einer Anfrage (POST /api/requests/:id/decision) */
export interface DecisionInput {
  mode: DecisionMode;
  reason: string;
  technicianId?: string;
  date?: string;
  override?: boolean;
}

export interface EscalationInput {
  type: Escalation['type'];
  newDate?: string;
  recipient: string;
  message: string;
}

/** Anfragen-Ausschnitt aus dem Datenbestand */
export interface AnfragenData {
  requests: ServiceRequest[];
  convertedRequests: ServiceRequest[];
  responsibility: Record<string, string[]>;
  escalations: Record<string, Escalation>;
}
