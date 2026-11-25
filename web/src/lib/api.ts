import { useCallback, useEffect, useState } from 'react';
import { getToken, handleUnauthorized } from './auth';
import type { AvailabilityEntry, Appointment, Issue, Plan, ServiceRequest, Technician, TravelResult } from './types';

// ---- Antwort-Typen der eigenen API ----

export interface Stammdaten {
  technicians: Technician[];
  availability: AvailabilityEntry[];
  requests: ServiceRequest[];
  appointments: Appointment[];
  issues: Issue[];
  range: { from: string; to: string };
  source: 'live' | 'mock';
  loadedAt: string;
  /** IDs mit lokalen Korrekturen */
  overridden?: Record<'requests' | 'technicians' | 'appointments', string[]>;
  /** Zuständige Techniker je Anfrage (Gebiet → sonst ≤ 15 km) */
  responsibility: Record<string, string[]>;
  /** Eskalationen je Anfrage (simuliert) */
  escalations: Record<string, Escalation>;
}

export interface Escalation {
  type: 'customer_delay' | 'internal';
  at: string;
  newDate?: string;
  recipient: string;
  message: string;
}

export interface LocalDb {
  updatedAt: string | null;
  path: string;
  overrides: Record<string, Record<string, Record<string, unknown>>>;
  log: { at: string; entity: string; id: string; action: string; changes?: Record<string, unknown> }[];
  editableFields: Record<'requests' | 'technicians' | 'appointments', string[]>;
}

export interface Overview {
  requests: { total: number; planned: number; open: number };
  appointments: { fixed: number };
  technicians: { total: number; available: number; techDays: number };
  actionRequired: {
    total: number;
    technicians: number;
    requests: number;
    appointments: number;
    availability: number;
    errors: number;
    warnings: number;
  };
  driveMinutes: number;
}

export interface Meta {
  source: 'live' | 'mock';
  range: { from: string; to: string };
  loadedAt: string;
  office: { label: string; lat: number; lng: number };
  /** Erster Werktag nach dem Planungszeitraum */
  nextWorkday: string;
}

export interface MapConfig {
  googleMapsApiKey: string;
  googleMapsMapId: string;
  tileUrl: string;
  attribution: string;
}

export interface AppConfig {
  map: MapConfig;
}

export interface RouteGeometry {
  points: { lat: number; lng: number }[];
  legs: TravelResult[];
}

// ---- Fetch + einfacher Cache (Datenstand ist eingefroren) ----

const cache = new Map<string, unknown>();

/** fetch mit Sitzungstoken; bei 401 wird die Sitzung beendet → Login-Seite */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    cache.clear();
    handleUnauthorized();
  }
  return res;
}

export async function apiGet<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const res = await authFetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  cache.set(path, body);
  return body as T;
}

/** Schreibende Requests (PATCH/DELETE/POST) – leert danach den Cache, damit Plan & Prüfungen neu laden */
export async function apiSend<T>(path: string, method: 'PATCH' | 'DELETE' | 'POST', body?: unknown): Promise<T> {
  const res = await authFetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`);
  cache.clear();
  return json as T;
}

export async function reloadData() {
  cache.clear();
  await authFetch('/api/reload', { method: 'POST' });
}

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(path && cache.has(path) ? (cache.get(path) as T) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!data && !!path);

  const load = useCallback(() => {
    if (!path) return;
    setLoading(true);
    setError(null);
    apiGet<T>(path)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}
