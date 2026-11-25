import { useCallback, useEffect, useState } from 'react';
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
}

export interface RouteGeometry {
  points: { lat: number; lng: number }[];
  legs: TravelResult[];
}

// ---- Fetch + einfacher Cache (Datenstand ist eingefroren) ----

const cache = new Map<string, unknown>();

export async function apiGet<T>(path: string): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const res = await fetch(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  cache.set(path, body);
  return body as T;
}

export async function reloadData() {
  cache.clear();
  await fetch('/api/reload', { method: 'POST' });
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
