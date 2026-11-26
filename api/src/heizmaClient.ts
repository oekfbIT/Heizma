import { config } from './config.js';
import appointmentsFixture from './fixtures/appointments.json';
import availabilityFixture from './fixtures/availability.json';
import requestsFixture from './fixtures/requests.json';
import techniciansFixture from './fixtures/technicians.json';
import type { Appointment, AvailabilityEntry, Dataset, LatLng, ServiceRequest, Technician, TravelResult } from './types.js';

/**
 * Client für die Heizma Case-Study-API.
 * - Token bleibt serverseitig (kommt aus .env, nie ins Frontend)
 * - Antworten werden im Speicher gecacht (eingefrorener Datenstand → wenig Calls)
 * - DATA_SOURCE=mock lädt lokale Beispieldaten aus src/fixtures (offline arbeiten)
 */

export class HeizmaApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < config.cacheTtlMs) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

export function clearCache() {
  cache.clear();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.heizmaBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.heizmaToken}`,
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new HeizmaApiError(res.status, body.error ?? `HTTP ${res.status} für ${path}`);
  return body as T;
}

const FIXTURES: Record<string, unknown> = {
  technicians: techniciansFixture,
  availability: availabilityFixture,
  requests: requestsFixture,
  appointments: appointmentsFixture,
};

async function fixture<T>(name: string): Promise<T> {
  return FIXTURES[name] as T;
}

export async function loadDataset(): Promise<Dataset> {
  const { planFrom: from, planTo: to } = config;
  return cached(`dataset:${config.dataSource}:${from}:${to}`, async () => {
    if (config.dataSource === 'mock') {
      const [t, a, r, ap] = await Promise.all([
        fixture<{ technicians: Technician[] }>('technicians'),
        fixture<{ entries: AvailabilityEntry[] }>('availability'),
        fixture<{ requests: ServiceRequest[] }>('requests'),
        fixture<{ appointments: Appointment[] }>('appointments'),
      ]);
      return {
        technicians: t.technicians,
        availability: a.entries,
        requests: r.requests,
        appointments: ap.appointments,
        range: { from, to },
        source: 'mock' as const,
        loadedAt: new Date().toISOString(),
      };
    }
    const [t, a, r, ap] = await Promise.all([
      request<{ technicians: Technician[] }>('/technicians'),
      request<{ entries: AvailabilityEntry[] }>(`/availability?from=${from}&to=${to}`),
      request<{ requests: ServiceRequest[] }>('/requests'),
      request<{ appointments: Appointment[] }>(`/appointments?from=${from}&to=${to}`),
    ]);
    return {
      technicians: t.technicians,
      availability: a.entries,
      requests: r.requests,
      appointments: ap.appointments,
      range: { from, to },
      source: 'live' as const,
      loadedAt: new Date().toISOString(),
    };
  });
}

/** Ein einzelner /travel/path-Call (2–14 Punkte), ungecacht – für die Fahrzeitmatrix */
export async function travelPathRaw(points: LatLng[]): Promise<TravelResult[]> {
  const res = await request<{ legs: TravelResult[] }>('/travel/path', { method: 'POST', body: JSON.stringify({ points }) });
  return res.legs;
}

/** Fahrtabschnitte für eine Punktfolge (max. 14 Punkte pro Call → wird gestückelt). */
export async function travelPath(points: LatLng[]): Promise<TravelResult[]> {
  if (points.length < 2) return [];
  if (config.dataSource === 'mock') {
    // Offline: keine echte Strecke – Frontend zeichnet gerade Linien
    return points.slice(1).map(() => ({ minutes: 0, km: 0, estimated: true, polyline: null }));
  }
  const key = `path:${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join('|')}`;
  return cached(key, async () => {
    const legs: TravelResult[] = [];
    for (let i = 0; i < points.length - 1; i += 13) {
      const chunk = points.slice(i, i + 14);
      const res = await request<{ legs: TravelResult[] }>('/travel/path', {
        method: 'POST',
        body: JSON.stringify({ points: chunk }),
      });
      legs.push(...res.legs);
    }
    return legs;
  });
}
