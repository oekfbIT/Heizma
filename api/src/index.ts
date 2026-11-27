/**
 * @file      index.ts – Express-Server: alle HTTP-Endpunkte der eigenen API (/api/*)
 * @layer     Backend · Schnittstelle (dünn: lädt Daten, ruft Domäne auf, formt JSON)
 * @einstieg  getPlan() (Plan-Cache) · Endpunkte nach Bereich, siehe MARK-Abschnitte unten
 * @nutzt     heizmaClient → localStore → validation → planner → verify (Pipeline, docs/02-architektur.md)
 * @siehe     docs/07-api.md (Endpunkt-Referenz) · docs/10-code-navigation.md
 *
 * SICHERHEIT: Der Heizma-Bearer-Token wird nur in heizmaClient.ts verwendet und nie an den Browser gegeben.
 *             Alles unter /api außer /api/health und /api/auth braucht eine gültige Sitzung (requireAuth).
 * Neuer Endpunkt: in den passenden MARK-Abschnitt, mit route(...) wrappen (Fehler → Error-Middleware),
 *                 in docs/07-api.md eintragen und im Web über ApiService → Modul-Interactor anbinden.
 */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from './config.js';
import { HeizmaApiError, loadDataset, travelPath } from './heizmaClient.js';
import { geocode, reverseGeocode } from './geocode.js';
import { buildPlan, rankOptions, requestErrors } from './planner.js';
import { getTravelMatrix } from './travelMatrix.js';
import { applyExceptions, verifyPlan } from './verify.js';
import type { Appointment, Dataset, Plan, RequestPlanning, ServiceRequest, SlotOption } from './types.js';
import { eligibleTechnicians, validateDataset } from './validation.js';
import { authRouter, requireAuth } from './mockauth/index.js';
import { applyOverrides, auditFor, clearDecision, listDecisions, setDecision, approveRoutes, dumpDb, listApprovals, unapproveRoutes, editableFields, escalate, listEscalations, resetAll, resetEntity, resetPlanning, updateEntity, ValidationError, withdrawEscalation, type EntityKey } from './localStore.js';

// MARK: - Hilfsfunktionen

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

// MARK: - App-Setup & Plan-Cache

const app = express();
app.use(cors());
app.use(express.json());

// Automatisch neu planen: Cache-Schlüssel ist der Inhaltsstand `data.version` (localStore.applyOverrides).
// Neue Heizma-Daten, eine Korrektur, Entscheidung oder Freigabe → anderer Stand → neuer Plan. Gleicher Inhalt → kein Neurechnen.
// Jeder Plan wird einmal berechnet und danach unabhängig geprüft.
let planCache: { version: string; plan: Promise<Plan> } | null = null;
function getPlan(data: Dataset): Promise<Plan> {
  const version = data.version ?? data.loadedAt;
  if (!planCache || planCache.version !== version) {
    const plan = (async () => {
      const { lookup, stats } = await getTravelMatrix(data);
      const t0 = Date.now();
      const decisions = listDecisions();
      const p = buildPlan(data, { travel: lookup, travelStats: stats, approvals: listApprovals(), decisions });
      p.verification = applyExceptions(verifyPlan(p, data, lookup, decisions), p, decisions);
      console.log(`[plan] ${p.stats.planned}/${p.stats.totalRequests} geplant, ${p.verification.totalViolations} Regelverstöße, ${Date.now() - t0} ms, Fahrzeiten: ${stats.source}`);
      return p;
    })();
    plan.catch(() => (planCache = null));
    planCache = { version, plan };
  }
  return planCache.plan;
}

/** Wrapper für async-Handler: reicht abgelehnte Promises an die Error-Middleware weiter (Express 4 tut das nicht selbst). */
type Handler = (req: Request, res: Response) => Promise<unknown>;
const route = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, source: config.dataSource });
});

// MARK: - Auth-Grenze
// SICHERHEIT: Mock-Login (fest hinterlegt) – alles darunter erfordert eine gültige Sitzung (2 h)
app.use('/api/auth', authRouter);
app.use('/api', requireAuth);

/** Frontend-Konfiguration (Karte) – nur nach Login, Google-Key per HTTP-Referrer einschränken */
app.get('/api/config', (_req, res) => {
  res.json({ map: config.map });
});

// MARK: - Stammdaten & Meta

app.get('/api/meta', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json({ source: data.source, range: data.range, loadedAt: data.loadedAt, office: config.office, nextWorkday: nextWorkday(data.range.to) });
}));

/**
 * ANNAHME: Freigegebene Touren → Anfragen werden (simuliert) zu Terminen.
 * Annahme: In Produktion legt die Freigabe die Termine im Heizma-Backend an; die Anfrage verschwindet
 * aus der Anfragenliste. Hier nur eine Sicht auf die Daten – Freigabe zurücknehmen macht sie wieder zur Anfrage.
 */
function terminView(data: Dataset): { requests: ServiceRequest[]; converted: ServiceRequest[]; appointments: Appointment[] } {
  const offset = /([+-]\d{2}:\d{2})$/.exec(data.appointments[0]?.start ?? '')?.[1] ?? '+01:00';
  const byId = new Map(data.requests.map((r) => [r.id, r]));
  const simulated: Appointment[] = [];
  for (const [key, approval] of Object.entries(listApprovals())) {
    const [technicianId, date] = key.split('@');
    for (const s of approval.stops) {
      const r = byId.get(s.id);
      if (!r) continue;
      const dur = r.visitationType === null ? 105 : r.durationMinutes;
      const [h, m] = s.start.split(':').map(Number);
      const endMin = h * 60 + m + dur;
      const end = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
      simulated.push({
        id: r.id, technicianId, type: 'Besichtigung', visitationType: r.visitationType, durationMinutes: dur,
        start: `${date}T${s.start}:00${offset}`, end: `${date}T${end}:00${offset}`,
        customer: r.customer, address: r.address, lat: r.lat!, lng: r.lng!, simulated: true, fromRequestId: r.id,
      });
    }
  }
  const ids = new Set(simulated.map((a) => a.id));
  return { requests: data.requests.filter((r) => !ids.has(r.id)), converted: data.requests.filter((r) => ids.has(r.id)), appointments: [...data.appointments, ...simulated] };
}

/** Stammdaten + Validierungsergebnis */
app.get('/api/stammdaten', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  // Zuständigkeit je Anfrage (Gebiet → sonst ≤ 15 km) – Basis für den Regionsfilter
  const responsibility = Object.fromEntries(data.requests.map((r) => [r.id, eligibleTechnicians(r, data.technicians).map((t) => t.id)]));
  const view = terminView(data);
  res.json({ ...data, requests: view.requests, appointments: view.appointments, convertedRequests: view.converted, issues: validateDataset(data), responsibility, escalations: listEscalations() });
}));

// MARK: - Planer-Entscheidungen je Anfrage (Status, Optionen, fixieren / verschieben / aus Plan nehmen)

async function planningFor(id: string): Promise<{ data: Dataset; plan: Plan; info: RequestPlanning } | null> {
  const data = await loadWorkingDataset();
  const request = data.requests.find((r) => r.id === id);
  if (!request) return null;
  const plan = await getPlan(data);
  const decision = listDecisions()[id] ?? null;
  const hit = plan.routes.find((r) => r.stops.some((s) => s.id === id));
  const unassigned = plan.unassigned.find((u) => u.requestId === id) ?? null;
  // ACHTUNG · GRUND-PRAEFIX: prüft den Anfang von `reason` – muss zu den Texten in planner.ts buildPlan() passen
  const waiting = plan.unassigned
    .filter((u) => u.reason.startsWith('Kapazität'))
    .map((u) => data.requests.find((r) => r.id === u.requestId)!)
    .filter(Boolean)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const pos = waiting.findIndex((r) => r.id === id);

  let route: RequestPlanning['route'] = null;
  if (hit) {
    const i = hit.stops.findIndex((s) => s.id === id);
    const tech = data.technicians.find((t) => t.id === hit.technicianId);
    route = { technicianId: hit.technicianId, technicianName: tech?.name ?? hit.technicianId, date: hit.date, start: hit.stops[i].start, end: hit.stops[i].end, position: i + 1, stops: hit.stops.length, approved: !!hit.approved };
  }
  // Status-Ableitung (Reihenfolge ist wichtig): Termin > aus Plan > fixiert > geplant > Warteliste > nicht planbar
  const status: RequestPlanning['status'] = route?.approved
    ? 'termin'
    : decision?.mode === 'exclude'
      ? 'excluded'
      : route && decision?.mode === 'pin'
        ? 'pinned'
        : route
          ? 'planned'
          : unassigned?.reason.startsWith('Kapazität')
            ? 'waitlist'
            : 'unplannable';
  const info: RequestPlanning = {
    requestId: id,
    status,
    route,
    reason: unassigned?.reason ?? null,
    notes: request.notes,
    decision,
    waitlist: pos >= 0 ? { position: pos + 1, total: waiting.length } : null,
    violations: (plan.verification?.rules ?? []).flatMap((r) => r.violations).filter((v) => v.stopId === id).map((v) => v.message),
    exceptions: (plan.verification?.exceptions ?? []).filter((e) => e.requestId === id),
    log: auditFor(id),
  };
  return { data, plan, info };
}

app.get('/api/requests/:id/planning', route(async (req, res) => {
  const r = await planningFor(req.params.id);
  if (!r) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  res.json(r.info);
}));

/** Mögliche Slots, sortiert: regelkonform & wenig Zusatz-Fahrzeit zuerst. Ändert nichts (Vorschau). */
app.get('/api/requests/:id/options', route(async (req, res) => {
  const r = await planningFor(req.params.id);
  if (!r) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  const errors = requestErrors(r.data, req.params.id);
  if (errors.length) return res.json({ options: [], blockedReason: `Datenfehler – erst korrigieren: ${errors[0]}` });
  const { lookup } = await getTravelMatrix(r.data);
  res.json({ options: rankOptions(r.data, r.plan, req.params.id, { travel: lookup }) });
}));

/**
 * Entscheidung des Planers. Body { mode: 'pin'|'exclude', technicianId?, date?, reason?, override? }
 * Grundsatz: Der Planer darf alles – aber ein Regelbruch braucht override + Begründung und bleibt im Plan sichtbar.
 */
/**
 * Antwort auf eine Planer-Entscheidung inkl. neuem Planungsstand dieser Anfrage.
 * ACHTUNG · VERCEL: Der Speicher (/tmp + Memory) gilt je Serverless-Instanz. Ein späteres GET kann auf einer anderen
 * Instanz landen, die die Entscheidung noch nicht kennt → das UI nimmt den Stand aus dieser Antwort (gleiche Instanz).
 */
async function respondDecision(res: Response, id: string, decision: unknown) {
  const fresh = await planningFor(id);
  res.json({ ok: true, decision, planning: fresh?.info ?? null });
}

app.post('/api/requests/:id/decision', route(async (req, res) => {
  const id = req.params.id;
  const r = await planningFor(id);
  if (!r) return res.status(404).json({ error: 'Anfrage nicht gefunden' });
  if (r.info.status === 'termin') return res.status(409).json({ error: 'Anfrage ist Teil einer freigegebenen Route – zuerst die Freigabe zurücknehmen' });
  const body = req.body ?? {};
  const mode = String(body.mode ?? '');
  const reason = String(body.reason ?? '').trim();
  const override = body.override === true;
  if (!['pin', 'exclude'].includes(mode)) throw new ValidationError('mode muss pin oder exclude sein');

  if (mode === 'exclude') {
    if (reason.length < 3) throw new ValidationError('Bitte kurz begründen, warum die Anfrage aus dem Plan genommen wird');
    return respondDecision(res, id, setDecision(id, { mode, reason, override: false }));
  }
  // DATEN: Fehlerhafte Daten können nicht eingeplant werden – auch nicht als Ausnahme. Erst korrigieren.
  const errors = requestErrors(r.data, id);
  if (errors.length) return res.status(409).json({ error: `Datenfehler – erst korrigieren: ${errors[0]}` });
  const technicianId = String(body.technicianId ?? '');
  const date = String(body.date ?? '');
  const { lookup } = await getTravelMatrix(r.data);
  const option: SlotOption | undefined = rankOptions(r.data, r.plan, id, { travel: lookup }).find((o) => o.technicianId === technicianId && o.date === date);
  if (!option) return res.status(400).json({ error: `${technicianId} ist am ${date} nicht verfügbar` });
  if (option.blocked) return res.status(409).json({ error: option.blocked });
  // Regelbruch nur mit override + Begründung → wird in verify.applyExceptions() gelb statt rot geführt
  if (option.warnings.length && !override) return res.status(409).json({ error: 'Regelbruch – nur als bewusste Ausnahme möglich', warnings: option.warnings, needsOverride: true });
  if (option.warnings.length && reason.length < 3) throw new ValidationError('Bitte die Ausnahme kurz begründen');
  await respondDecision(res, id, setDecision(id, { mode: 'pin', technicianId, date, reason, override: option.warnings.length > 0 }));
}));

app.delete('/api/requests/:id/decision', route(async (req, res) => {
  clearDecision(req.params.id);
  await respondDecision(res, req.params.id, null);
}));

// MARK: - Plan & Übersicht

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

/**
 * Inhaltsstand für die automatische Aktualisierung: Der Browser fragt ihn regelmäßig ab und lädt Plan und Ansichten
 * neu, sobald er sich ändert. Heizma-Daten werden spätestens nach CACHE_TTL_SECONDS (Standard 10 min) frisch geholt.
 */
app.get('/api/version', route(async (_req, res) => {
  const data = await loadWorkingDataset();
  res.json({ version: data.version ?? data.loadedAt });
}));

/** Tourenplan (Entwurf) */
app.get('/api/plan', route(async (_req, res) => {
  res.json(await getPlan(await loadWorkingDataset()));
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

// MARK: - Freigaben

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

// MARK: - Lokale Korrekturen (simulierte Schreib-API – die Heizma-API ist read-only)
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

// MARK: - Eskalationen (simuliert: Nachricht wird gespeichert, nicht versendet)
// Techniker-Eskalation: ziel = "techniker" (Verfügbarkeit/Gebiet anfragen) oder "vertrieb" (Lösung nötig)
const TECH_TARGETS = { techniker: 'technician_request', vertrieb: 'internal' } as const;
app.post('/api/escalations/technicians/:id/:target', route(async (req, res) => {
  const target = req.params.target as keyof typeof TECH_TARGETS;
  if (!TECH_TARGETS[target]) return res.status(400).json({ error: 'Ziel muss techniker oder vertrieb sein' });
  const data = await loadDataset();
  if (!data.technicians.some((t) => t.id === req.params.id)) return res.status(404).json({ error: 'Außendienstler nicht gefunden' });
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

// MARK: - Geocoding (DATEN: fehlende Koordinaten, Tippfehler in Adressen)

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

// MARK: - Lokale Datenbank (Debug/Demo)

app.get('/api/local-db', (_req, res) => {
  res.json({ ...dumpDb(), editableFields: editableFields() });
});

/** ?scope=planning → nur Planungsstand (Freigaben, Entscheidungen …), sonst alles inkl. Datenkorrekturen */
app.post('/api/local-db/reset', (req, res) => {
  if (req.query.scope === 'planning') resetPlanning();
  else resetAll();
  res.json({ ok: true, scope: req.query.scope === 'planning' ? 'planning' : 'all' });
});

// MARK: - Fehlerbehandlung & Start
// Reihenfolge: ValidationError → 400, HeizmaApiError → 502, Rest → 500

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ValidationError) return res.status(400).json({ error: err.message });
  next(err);
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
    // Aufwärmen im Hintergrund: Daten, Fahrzeiten und Plan sind fertig, bevor die erste Seite lädt
    loadWorkingDataset()
      .then(getPlan)
      .then(() => console.log('[api] Plan vorberechnet – bereit'))
      .catch((e) => console.warn('[api] Vorberechnung fehlgeschlagen, wird beim ersten Aufruf nachgeholt:', (e as Error).message));
  });
}

export default app;
