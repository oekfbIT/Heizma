import { ApiService } from '@/core/ApiService';
import type { Plan } from '@/lib/types';
import type { Stammdaten } from '@/modules';

export interface Call {
  path: string;
  method: string;
  body?: unknown;
  auth: string | null;
}

/** Fake-Server: Pfad → Antwort. Zeichnet alle Requests auf. */
export function fakeApi(routes: Record<string, unknown | ((call: Call) => unknown)>, opts: { token?: string | null } = {}) {
  const calls: Call[] = [];
  const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(input);
    const headers = new Headers(init.headers);
    const call: Call = {
      path,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get('Authorization'),
    };
    calls.push(call);
    const key = `${call.method} ${path.split('?')[0]}`;
    const handler = routes[key] ?? routes[path] ?? routes[`${call.method} ${path}`];
    if (handler === undefined) return new Response(JSON.stringify({ error: `not found: ${key}` }), { status: 404 });
    const result = typeof handler === 'function' ? (handler as (c: Call) => unknown)(call) : handler;
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result ?? {}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof globalThis.fetch;
  const api = new ApiService({ fetch, getToken: () => (opts.token === undefined ? 'tkn' : opts.token) });
  return { api, calls, fetch };
}

export const stammdaten = (over: Partial<Stammdaten> = {}): Stammdaten => ({
  technicians: [
    { id: 'tech_01', name: 'Techniker Nord', home: { lat: 48.3, lng: 14.28, label: '4020 Linz' }, region: [] },
    { id: 'tech_02', name: 'Techniker Süd', home: { lat: 47.07, lng: 15.44, label: '8010 Graz' }, region: [] },
  ],
  availability: [
    { technicianId: 'tech_01', date: '2026-11-24', start: '07:00', end: '19:00', blocked: false },
    { technicianId: 'tech_01', date: '2026-11-23', start: '07:00', end: '12:00', blocked: false },
    { technicianId: 'tech_02', date: '2026-11-23', start: '07:00', end: '19:00', blocked: true },
  ],
  requests: [
    {
      id: 'req_1',
      customer: 'Kunde 1',
      address: 'Grazbachgasse 12, 8010 Graz',
      lat: 47.06,
      lng: 15.44,
      visitationType: 'PV',
      durationMinutes: 60,
      customerAvailableFrom: null,
      notes: null,
      createdAt: '2026-11-03T09:12:00+01:00',
    },
  ],
  appointments: [],
  issues: [],
  range: { from: '2026-11-23', to: '2026-11-27' },
  source: 'mock',
  loadedAt: 'test',
  responsibility: { req_1: ['tech_02'], req_2: [] },
  escalations: {},
  convertedRequests: [
    {
      id: 'req_9',
      customer: 'Kunde 9',
      address: 'Hauptplatz 1, 4020 Linz',
      lat: 48.3,
      lng: 14.28,
      visitationType: 'WP',
      durationMinutes: 75,
      customerAvailableFrom: null,
      notes: null,
      createdAt: '2026-11-01T08:00:00+01:00',
    },
  ],
  ...over,
});

/** Minimaler Plan mit zwei Routen am selben Tag */
export const plan = (over: Partial<Plan> = {}): Plan =>
  ({
    routes: [
      {
        technicianId: 'tech_01',
        date: '2026-11-23',
        window: { start: '07:00', end: '12:00' },
        stops: [{ id: 'req_1', kind: 'request', start: '08:00', end: '09:00' }],
        driveMinutes: 40,
        approved: true,
      },
      {
        technicianId: 'tech_02',
        date: '2026-11-23',
        window: { start: '07:00', end: '19:00' },
        stops: [{ id: 'req_3', kind: 'request', start: '10:00', end: '11:00', manual: { mode: 'pin' } }],
        driveMinutes: 30,
        approved: false,
      },
      { technicianId: 'tech_01', date: '2026-11-24', window: { start: '07:00', end: '19:00' }, stops: [], driveMinutes: 0, approved: false },
    ],
    unassigned: [
      { requestId: 'req_4', reason: 'Kapazität: kein Platz' },
      { requestId: 'req_5', reason: 'Aus dem Plan genommen: Kunde ruft zurück' },
      { requestId: 'req_6', reason: 'Keine Koordinaten – zuerst geokodieren' },
    ],
    stats: {},
    verification: {
      rules: [
        {
          violations: [
            { technicianId: 'tech_02', date: '2026-11-23', stopId: 'req_3', message: 'Kunde erst ab 12:00' },
            { technicianId: 'tech_02', date: '2026-11-23', message: 'Heimfahrt zu spät' },
            { technicianId: 'tech_01', date: '2026-11-23', stopId: 'req_1', message: 'anderer Tag' },
          ],
        },
      ],
      exceptions: [{ requestId: 'req_1', technicianId: 'tech_01', date: '2026-11-23' }],
    },
    ...over,
  }) as unknown as Plan;
