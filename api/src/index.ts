import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { clearCache, HeizmaApiError, loadDataset, travelPath } from './heizmaClient.js';
import { geocode, reverseGeocode } from './geocode.js';
import { buildPlan } from './planner.js';
import { getTravelMatrix, resetTravelMatrix } from './travelMatrix.js';
import { verifyPlan } from './verify.js';
import { getNoteInsights } from './notesAi.js';
import type { Dataset, Plan } from './types.js';
import { eligibleTechnicians, validateDataset } from './validation.js';
import { authRouter, requireAuth } from './mockauth/index.js';
import { applyOverrides, approveRoutes, confirmNote, listNoteConfirmations, dumpDb, listApprovals, unapproveRoutes, editableFields, escalate, listEscalations, resetAll, resetEntity, updateEntity, ValidationError, withdrawEscalation, type EntityKey } from './localStore.js';

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

// Plan wird pro Datenstand (inkl. Korrekturen & Freigaben) einmal berechnet und danach unabhängig geprüft
let planCache: { loadedAt: string; plan: Promise<Plan> } | null = null;
function getPlan(data: Dataset): Promise<Plan> {
  if (!planCache || planCache.loadedAt !== data.loadedAt) {
    const plan = (async () => {
      const { lookup, stats } = await getTravelMatrix(data);
      const t0 = Date.now();
      const noteConstraints = listNoteConfirmations();
      const p = buildPlan(data, { travel: lookup, travelStats: stats, approvals: listApprovals(), noteConstraints });
      p.verification = verifyPlan(p, data, lookup, noteConstraints);
      console.log(`[plan] ${p.stats.planned}/${p.stats.totalRequests} geplant, ${p.verification.totalViolations} Regelverstöße, ${Date.now() - t0} ms, Fahrzeiten: ${stats.source}`);
      return p;
    })();
    plan.catch(() => (planCache = null));
    planCache = { loadedAt: data.loadedAt, plan };
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
  const plan = await getPlan(data);
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
    violations: plan.verification?.totalViolations ?? null,
  });
}));

/** Tourenplan (Entwurf) */
app.get('/api/plan', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json(await getPlan(data));
}));

/** Straßengeometrie einer Tagesroute (Polylines aus /travel/path, gecacht) */
app.get('/api/plan/:technicianId/:date/geometry', route(async (req, res) => {
  const data = await loadWorkingDataset();
  const plan = await getPlan(data);
  const dayRoute = plan.routes.find((r) => r.technicianId === req.params.technicianId && r.date === req.params.date);
  const tech = data.technicians.find((t) => t.id === req.params.technicianId);
  if (!dayRoute || !tech) return res.status(404).json({ error: 'Route nicht gefunden' });
  const points = [tech.home, ...dayRoute.stops.map((s) => ({ lat: s.lat, lng: s.lng })), tech.home].map((p) => ({ lat: p.lat, lng: p.lng }));
  const legs = await travelPath(points);
  res.json({ points, legs });
}));

/**
 * Freigabe: Tagesrouten werden mit Reihenfolge und Startzeiten eingefroren.
 * Body { keys: ["tech_01@2026-11-23", ...] } – ohne keys = alle Routen mit Stopps (optional ?date=).
 * Nur regelkonforme Routen sind freigebbar.
 */
app.post('/api/approvals', route(async (req, res) => {
  const data = await loadWorkingDataset();
  const plan = await getPlan(data);
  const date = typeof req.query.date === 'string' ? req.query.date : null;
  const wanted: string[] | null = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : null;
  const bad = new Set((plan.verification?.rules ?? []).flatMap((r) => r.violations).map((v) => `${v.technicianId}@${v.date}`));
  const candidates = plan.routes.filter((r) => r.stops.length && !r.approved && (!date || r.date === date) && (!wanted || wanted.includes(`${r.technicianId}@${r.date}`)));
  const blocked = candidates.filter((r) => bad.has(`${r.technicianId}@${r.date}`)).map((r) => `${r.technicianId}@${r.date}`);
  const ok = candidates.filter((r) => !bad.has(`${r.technicianId}@${r.date}`));
  approveRoutes(ok.map((r) => ({ key: `${r.technicianId}@${r.date}`, stops: r.stops.map((s) => ({ id: s.id, start: s.start })) })));
  res.json({ ok: true, approved: ok.length, blocked });
}));

app.delete('/api/approvals', route(async (req, res) => {
  const keys: string[] = Array.isArray(req.body?.keys) ? req.body.keys.map(String) : Object.keys(listApprovals());
  unapproveRoutes(keys);
  res.json({ ok: true, removed: keys.length });
}));

/** Export einer freigegebenen Tagesroute als Kalenderdatei (.ics) für die Techniker:in */
app.get('/api/plan/:technicianId/:date/ics', route(async (req, res) => {
  const data = await loadWorkingDataset();
  const plan = await getPlan(data);
  const r = plan.routes.find((x) => x.technicianId === req.params.technicianId && x.date === req.params.date);
  if (!r) return res.status(404).json({ error: 'Route nicht gefunden' });
  const dt = (hhmm: string) => `${r.date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
  const esc = (x: string) => x.replace(/[,;\\]/g, (m) => `\\${m}`);
  const events = r.stops.map((s, i) => [
    'BEGIN:VEVENT',
    `UID:${s.id}-${r.date}@heizma-routenplanung`,
    `DTSTART;TZID=Europe/Vienna:${dt(s.start)}`,
    `DTEND;TZID=Europe/Vienna:${dt(s.end)}`,
    `SUMMARY:${i + 1}. ${esc(s.customer)} (${s.visitationType ?? 'Termin'})`,
    `LOCATION:${esc(s.address)}`,
    `DESCRIPTION:Anfahrt ${s.travelMinutes} min · https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`,
    'END:VEVENT',
  ].join('\r\n'));
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="route-${r.technicianId}-${r.date}.ics"`);
  res.send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Heizma Routenplanung//DE', ...events, 'END:VCALENDAR'].join('\r\n'));
}));

/** KI-Hinweise aus den Vertriebsnotizen (Vorschläge) + vom Planer bestätigte Zeitgrenzen */
app.get('/api/notes', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json({ insights: await getNoteInsights(data.requests), confirmed: listNoteConfirmations(), ai: !!process.env.ANTHROPIC_API_KEY });
}));

/** Zeit-Hinweis bestätigen → wird harte Regel in Planung & Prüfung. Body { earliest?, latest? } oder null zum Zurücknehmen */
app.post('/api/notes/:requestId/confirm', route(async (req, res) => {
  const data = await loadDataset();
  if (!data.requests.some((r) => r.id === req.params.requestId)) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  confirmNote(req.params.requestId, req.body && (req.body.earliest || req.body.latest) ? { earliest: req.body.earliest || undefined, latest: req.body.latest || undefined } : null);
  res.json({ ok: true });
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
  const result = await geocode(address, await loadWorkingDataset());
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
  resetTravelMatrix();
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
