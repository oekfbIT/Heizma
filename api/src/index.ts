import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { clearCache, HeizmaApiError, loadDataset, travelPath } from './heizmaClient.js';
import { geocode, reverseGeocode } from './geocode.js';
import { buildPlan } from './planner.js';
import type { Dataset, Plan } from './types.js';
import { eligibleTechnicians, validateDataset } from './validation.js';
import { authRouter, requireAuth } from './mockauth/index.js';
import { applyOverrides, dumpDb, editableFields, escalate, listEscalations, resetAll, resetEntity, updateEntity, ValidationError, withdrawEscalation, type EntityKey } from './localStore.js';

/** Erster Werktag nach dem Planungszeitraum – Vorschlag für verschobene Termine */
function nextWorkday(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** Arbeitsdaten = Heizma-API + lokale Korrekturen */
async function loadWorkingDataset() {
  return applyOverrides(await loadDataset());
}

const app = express();
app.use(cors());
app.use(express.json());

// Plan wird pro geladenem Datenstand einmal berechnet
let planCache: { loadedAt: string; plan: Plan } | null = null;
function getPlan(data: Dataset): Plan {
  if (!planCache || planCache.loadedAt !== data.loadedAt) {
    planCache = { loadedAt: data.loadedAt, plan: buildPlan(data) };
  }
  return planCache.plan;
}

type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, source: config.dataSource });
});

// Mock-Login (fest hinterlegt) – alles darunter erfordert eine gültige Sitzung (2 h)
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

/** Frontend-Konfiguration (Karte) – nur nach Login, Google-Key per HTTP-Referrer einschränken */
app.get('/api/config', (_req, res) => {
  res.json({ map: config.map });
});

app.get('/api/meta', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json({ source: data.source, range: data.range, loadedAt: data.loadedAt, office: config.office, nextWorkday: nextWorkday(data.range.to) });
}));

/** Stammdaten + Validierungsergebnis */
app.get('/api/stammdaten', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  // Zuständigkeit je Anfrage (Gebiet → sonst ≤ 15 km) – Basis für den Regionsfilter
  const responsibility = Object.fromEntries(data.requests.map((r) => [r.id, eligibleTechnicians(r, data.technicians).map((t) => t.id)]));
  res.json({ ...data, issues: validateDataset(data), responsibility, escalations: listEscalations() });
}));

/** Übersichtszahlen für die Kacheln */
app.get('/api/overview', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  const issues = validateDataset(data);
  const plan = getPlan(data);
  const actionable = issues.filter((i) => i.severity !== 'info');
  const uniq = (kind: string) => new Set(actionable.filter((i) => i.entity === kind).map((i) => i.entityId)).size;
  res.json({
    requests: { total: data.requests.length, planned: plan.stats.planned, open: plan.stats.unassigned },
    appointments: { fixed: data.appointments.length },
    technicians: {
      total: data.technicians.length,
      available: new Set(data.availability.filter((a) => !a.blocked).map((a) => a.technicianId)).size,
      techDays: data.availability.filter((a) => !a.blocked).length,
    },
    actionRequired: {
      total: uniq('technician') + uniq('request') + uniq('appointment') + uniq('availability'),
      technicians: uniq('technician'),
      requests: uniq('request'),
      appointments: uniq('appointment'),
      availability: uniq('availability'),
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warning').length,
    },
    driveMinutes: plan.stats.driveMinutes,
  });
}));

/** Tourenplan (Entwurf) */
app.get('/api/plan', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json(getPlan(data));
}));

/** Straßengeometrie einer Tagesroute (Polylines aus /travel/path, gecacht) */
app.get('/api/plan/:technicianId/:date/geometry', route(async (req, res) => {
  const data = await loadWorkingDataset();
  const plan = getPlan(data);
  const dayRoute = plan.routes.find((r) => r.technicianId === req.params.technicianId && r.date === req.params.date);
  const tech = data.technicians.find((t) => t.id === req.params.technicianId);
  if (!dayRoute || !tech) return res.status(404).json({ error: 'Route nicht gefunden' });
  const points = [tech.home, ...dayRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })), tech.home].map((p) => ({ lat: p.lat, lng: p.lng }));
  const legs = await travelPath(points);
  res.json({ points, legs });
}));


// ---- Lokale Korrekturen (simulierte Schreib-API, siehe README „Lokale Korrekturen“) ----
const ENTITY_KEYS: EntityKey[] = ['requests', 'technicians', 'appointments'];
const entityParam = (req: Request) => {
  const e = req.params.entity as EntityKey;
  if (!ENTITY_KEYS.includes(e)) throw new ValidationError(`Unbekannter Bereich ${req.params.entity}`);
  return e;
};

app.patch('/api/stammdaten/:entity/:id', route(async (req, res) => {
  const entity = entityParam(req);
  const data = await loadDataset();
  const exists = (data[entity] as { id: string }[]).some((x) => x.id === req.params.id);
  if (!exists) return res.status(404).json({ error: `${req.params.id} nicht gefunden` });
  const override = updateEntity(entity, req.params.id, req.body ?? {});
  res.json({ ok: true, id: req.params.id, override });
}));

app.delete('/api/stammdaten/:entity/:id', route(async (req, res) => {
  resetEntity(entityParam(req), req.params.id);
  res.json({ ok: true });
}));

// ---- Eskalationen (simuliert: Nachricht wird gespeichert, nicht versendet) ----
// Techniker-Eskalation: ziel = "techniker" (Verfügbarkeit/Gebiet anfragen) oder "vertrieb" (Lösung nötig)
const TECH_TARGETS = { techniker: 'technician_request', vertrieb: 'internal' } as const;
app.post('/api/escalations/technicians/:id/:target', route(async (req, res) => {
  const target = req.params.target as keyof typeof TECH_TARGETS;
  if (!TECH_TARGETS[target]) return res.status(400).json({ error: 'Ziel muss techniker oder vertrieb sein' });
  const data = await loadDataset();
  if (!data.technicians.some((t) => t.id === req.params.id)) return res.status(404).json({ error: 'Techniker nicht gefunden' });
  const escalation = escalate(`technicians:${req.params.id}:${target}`, { ...(req.body ?? {}), type: TECH_TARGETS[target] }, data.range.to);
  res.json({ ok: true, escalation });
}));

app.delete('/api/escalations/technicians/:id/:target', (req, res) => {
  withdrawEscalation(`technicians:${req.params.id}:${req.params.target}`);
  res.json({ ok: true });
});

app.post('/api/escalations/:requestId', route(async (req, res) => {
  const data = await loadDataset();
  if (!data.requests.some((r) => r.id === req.params.requestId)) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  res.json({ ok: true, escalation: escalate(req.params.requestId, req.body ?? {}, data.range.to) });
}));

app.delete('/api/escalations/:requestId', (req, res) => {
  withdrawEscalation(req.params.requestId);
  res.json({ ok: true });
});

app.get('/api/geocode', route(async (req, res) => {
  const address = String(req.query.address ?? '').trim();
  if (!address) return res.status(400).json({ error: 'Adresse fehlt' });
  const result = await geocode(address);
  if (!result) return res.status(404).json({ error: 'Adresse nicht gefunden' });
  res.json(result);
}));

app.get('/api/geocode/reverse', route(async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Ungültige Koordinaten' });
  const result = await reverseGeocode(lat, lng);
  if (!result) return res.status(404).json({ error: 'Keine Adresse zu diesen Koordinaten gefunden' });
  res.json(result);
}));

app.get('/api/local-db', (_req, res) => {
  res.json({ ...dumpDb(), editableFields: editableFields() });
});

app.post('/api/local-db/reset', (_req, res) => {
  resetAll();
  res.json({ ok: true });
});

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  next(err);
});

/** Cache leeren und neu laden */
app.post('/api/reload', (_req, res) => {
  clearCache();
  planCache = null;
  res.json({ ok: true });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HeizmaApiError) {
    return res.status(502).json({ error: `Heizma-API: ${err.message}`, upstreamStatus: err.status });
  }
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
});

// Auf Vercel übernimmt die Plattform den Server – lokal/Docker selbst starten
if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`[api] läuft auf http://localhost:${config.port} (Datenquelle: ${config.dataSource})`);
  });
}

export default app;
