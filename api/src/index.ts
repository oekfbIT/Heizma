import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { clearCache, HeizmaApiError, loadDataset, travelPath } from './heizmaClient.js';
import { buildPlan } from './planner.js';
import type { Dataset, Plan } from './types.js';
import { validateDataset } from './validation.js';

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

app.get('/api/meta', route(async (_req, res) => {
  const data = await loadDataset();
  res.json({ source: data.source, range: data.range, loadedAt: data.loadedAt, office: config.office });
}));

/** Stammdaten + Validierungsergebnis */
app.get('/api/stammdaten', route(async (_req, res) => {
  const data = await loadDataset();
  res.json({ ...data, issues: validateDataset(data) });
}));

/** Übersichtszahlen für die Kacheln */
app.get('/api/overview', route(async (_req, res) => {
  const data = await loadDataset();
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
  const data = await loadDataset();
  res.json(getPlan(data));
}));

/** Straßengeometrie einer Tagesroute (Polylines aus /travel/path, gecacht) */
app.get('/api/plan/:technicianId/:date/geometry', route(async (req, res) => {
  const data = await loadDataset();
  const plan = getPlan(data);
  const dayRoute = plan.routes.find((r) => r.technicianId === req.params.technicianId && r.date === req.params.date);
  const tech = data.technicians.find((t) => t.id === req.params.technicianId);
  if (!dayRoute || !tech) return res.status(404).json({ error: 'Route nicht gefunden' });
  const points = [tech.home, ...dayRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })), tech.home].map((p) => ({ lat: p.lat, lng: p.lng }));
  const legs = await travelPath(points);
  res.json({ points, legs });
}));

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

app.listen(config.port, () => {
  console.log(`[api] läuft auf http://localhost:${config.port} (Datenquelle: ${config.dataSource})`);
});
