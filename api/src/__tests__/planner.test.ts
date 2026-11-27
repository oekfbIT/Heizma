/**
 * @file      planner.test.ts – Tests für Planung, Regeln und unabhängige Prüfung (node:test)
 * @layer     Backend · Tests
 * @siehe     docs/06-tests-und-qualitaet.md · docs/10-code-navigation.md
 *
 * Jeder Test trägt den Tag der Regel, die er absichert → `npm run code:index -- REGEL-3` zeigt Umsetzung, Prüfung und Test.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import appointments from '../fixtures/appointments.json';
import availability from '../fixtures/availability.json';
import requests from '../fixtures/requests.json';
import technicians from '../fixtures/technicians.json';
import { baselinePlan, buildPlan, rankOptions } from '../planner.js';
import { estimateLookup } from '../travelMatrix.js';
import { normalizeTime } from '../time.js';
import type { Appointment, AvailabilityEntry, Dataset, Decision, Plan, ServiceRequest, Technician } from '../types.js';
import { applyExceptions, verifyPlan } from '../verify.js';
import { validateDataset } from '../validation.js';

const travel = estimateLookup;
const fixtureData = (): Dataset => ({
  technicians: technicians.technicians as Technician[],
  availability: availability.entries as AvailabilityEntry[],
  requests: requests.requests as ServiceRequest[],
  appointments: appointments.appointments as Appointment[],
  range: { from: '2026-11-23', to: '2026-11-27' },
  source: 'mock',
  loadedAt: 'test',
});

// Synthetischer Mini-Datensatz: Techniker in Wien mit Quadrat-Gebiet um Wien
const VIENNA = { lat: 48.2082, lng: 16.3738 };
const tech = (over: Partial<Technician> = {}): Technician => ({
  id: 'tech_t',
  name: 'Test',
  home: { ...VIENNA, label: '1010 Wien' },
  region: [
    { lat: 48.4, lng: 16.1 },
    { lat: 48.4, lng: 16.7 },
    { lat: 48.0, lng: 16.7 },
    { lat: 48.0, lng: 16.1 },
  ],
  ...over,
});
let n = 0;
const req = (over: Partial<ServiceRequest> = {}): ServiceRequest => ({
  id: `req_${++n}`,
  customer: `Kunde ${n}`,
  address: 'Teststraße 1, 1010 Wien',
  lat: 48.21,
  lng: 16.4,
  visitationType: 'WP',
  durationMinutes: 75,
  customerAvailableFrom: null,
  notes: null,
  createdAt: `2026-11-0${(n % 9) + 1}T09:00:00+01:00`,
  ...over,
});
const day = (start = '07:00', end = '19:00', date = '2026-11-23'): AvailabilityEntry => ({ technicianId: 'tech_t', date, start, end, blocked: false });
const ds = (reqs: ServiceRequest[], avail: AvailabilityEntry[] = [day()], techs: Technician[] = [tech()], apts: Appointment[] = []): Dataset => ({
  technicians: techs,
  availability: avail,
  requests: reqs,
  appointments: apts,
  range: { from: '2026-11-23', to: '2026-11-27' },
  source: 'mock',
  loadedAt: 'test',
});
const plannedIds = (p: Plan) => new Set(p.routes.flatMap((r) => r.stops.map((s) => s.id)));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// REGEL-1 … REGEL-8: kompletter echter Datensatz, Prüfung muss 0 Verstöße melden
test('Gesamter Datensatz: 0 Regelverstöße', () => {
  const data = fixtureData();
  const plan = buildPlan(data, { travel });
  const v = verifyPlan(plan, data, travel);
  assert.equal(v.totalViolations, 0, JSON.stringify(v.rules.flatMap((r) => r.violations).slice(0, 5)));
  assert.ok(plan.stats.planned > 0);
});

// TRADE-OFF: Absicherung der Heuristik (Phase 3)
test('Optimierung ist nie schlechter als Greedy und plant nicht weniger ein', () => {
  const data = fixtureData();
  const opt = buildPlan(data, { travel });
  const greedy = buildPlan(data, { travel, optimize: false });
  assert.ok(opt.stats.driveMinutes <= greedy.stats.driveMinutes);
  assert.ok(opt.stats.planned >= greedy.stats.planned);
});

// REGEL-4
test('customerAvailableFrom ist eine harte Grenze', () => {
  const r = req({ customerAvailableFrom: '14:00' });
  const plan = buildPlan(ds([r]), { travel });
  const stop = plan.routes[0].stops.find((s) => s.id === r.id)!;
  assert.ok(stop.start >= '14:00');
});

// REGEL-3
test('Mittagspause nur an ganzen Tagen, 60 min, Beginn 11:30–13:00', () => {
  const reqs = [req(), req(), req(), req()];
  const full = buildPlan(ds(reqs), { travel }).routes[0];
  assert.ok(full.lunch);
  assert.ok(full.lunch!.start >= '11:30' && full.lunch!.start <= '13:00');
  const half = buildPlan(ds(reqs.slice(0, 2), [day('07:00', '12:00')]), { travel }).routes[0];
  assert.equal(half.lunch, null);
});

// REGEL-5
test('Zuständigkeit: außerhalb Gebiet ≤ 15 km wird eingeplant, > 15 km nicht zuordenbar', () => {
  const noRegion = tech({ region: [] });
  const near = req({ lat: VIENNA.lat + 0.11, lng: VIENNA.lng }); // ≈ 12 km
  const far = req({ lat: VIENNA.lat + 0.16, lng: VIENNA.lng }); // ≈ 18 km
  const plan = buildPlan(ds([near, far], [day()], [noRegion]), { travel });
  assert.ok(plannedIds(plan).has(near.id));
  assert.match(plan.unassigned.find((u) => u.requestId === far.id)!.reason, /Nicht zuordenbar/);
});

// REGEL-8
test('Kapazität knapp: ältere Anfrage gewinnt', () => {
  const older = req({ createdAt: '2026-11-01T08:00:00+01:00', visitationType: 'WP+PV', durationMinutes: 105 });
  const newer = req({ createdAt: '2026-11-10T08:00:00+01:00', visitationType: 'WP+PV', durationMinutes: 105 });
  // 07–10 Uhr: nur ein 105-min-Termin passt
  const plan = buildPlan(ds([newer, older], [day('07:00', '10:00')]), { travel });
  const ids = plannedIds(plan);
  assert.ok(ids.has(older.id));
  assert.ok(!ids.has(newer.id));
});

// REGEL-6
test('Fixe Termine bleiben, wo sie sind', () => {
  const apt: Appointment = {
    id: 'apt_t', technicianId: 'tech_t', type: 'Inbetriebnahme', visitationType: null, durationMinutes: 240,
    start: '2026-11-23T09:00:00+01:00', end: '2026-11-23T13:00:00+01:00', customer: 'Fix', address: 'x', lat: 48.25, lng: 16.4,
  };
  const plan = buildPlan(ds([req(), req()], [day()], [tech()], [apt]), { travel });
  const stop = plan.routes[0].stops.find((s) => s.id === 'apt_t')!;
  assert.equal(stop.start, '09:00');
  assert.equal(stop.end, '13:00');
});

// DATEN: visitationType = null
test('Unbekannter Typ wird mit 105 min geplant', () => {
  const r = req({ visitationType: null, durationMinutes: 0 });
  const stop = buildPlan(ds([r]), { travel }).routes[0].stops[0];
  assert.equal(stop.end > stop.start, true);
  const [h1, m1] = stop.start.split(':').map(Number), [h2, m2] = stop.end.split(':').map(Number);
  assert.equal(h2 * 60 + m2 - (h1 * 60 + m1), 105);
});

// REGEL-6 (sinngemäß): freigegebene Routen sind wie fixe Termine
test('Freigegebene Route bleibt bei Neuplanung unverändert', () => {
  const data = fixtureData();
  const first = buildPlan(data, { travel });
  const r = first.routes.find((x) => x.stops.length >= 3)!;
  const key = `${r.technicianId}@${r.date}`;
  const approvals = { [key]: { at: 'now', stops: r.stops.map((s) => ({ id: s.id, start: s.start })) } };
  // Daten ändern sich: neue, sehr alte Anfrage direkt am Wohnort
  const t = data.technicians.find((x) => x.id === r.technicianId)!;
  data.requests = [...data.requests, req({ lat: t.home.lat, lng: t.home.lng, createdAt: '2026-01-01T00:00:00+01:00' })];
  const second = buildPlan(data, { travel, approvals });
  const again = second.routes.find((x) => `${x.technicianId}@${x.date}` === key)!;
  assert.deepEqual(again.stops.map((s) => [s.id, s.start]), r.stops.map((s) => [s.id, s.start]));
  assert.ok(again.approved);
  assert.equal(verifyPlan(second, data, travel).totalViolations, 0);
});

// REGEL-7 · Prüfung prüft sich selbst (Überlappung, doppelt, verloren, Pause)
test('Validator erkennt eingeschleuste Fehler', () => {
  const data = fixtureData();
  const plan = buildPlan(data, { travel });
  const route = plan.routes.find((r) => r.stops.some((s) => s.kind === 'request') && r.stops.length >= 2)!;
  const reqStop = route.stops.find((s) => s.kind === 'request')!;

  const overlap = clone(plan);
  const o = overlap.routes.find((r) => r.technicianId === route.technicianId && r.date === route.date)!;
  o.stops[1].start = o.stops[0].start; // zweiter Stopp beginnt gleichzeitig mit erstem
  assert.ok(verifyPlan(overlap, data, travel).rules.find((r) => r.rule === 'travel')!.violations.length > 0);

  const dup = clone(plan);
  dup.routes.find((r) => r.technicianId === route.technicianId && r.date === route.date)!.stops.push({ ...reqStop });
  assert.ok(verifyPlan(dup, data, travel).rules.find((r) => r.rule === 'unique')!.violations.length > 0);

  const lost = clone(plan);
  const l = lost.routes.find((r) => r.technicianId === route.technicianId && r.date === route.date)!;
  l.stops = l.stops.filter((s) => s.id !== reqStop.id);
  assert.ok(verifyPlan(lost, data, travel).rules.find((r) => r.rule === 'unique')!.violations.length > 0);

  const badLunch = clone(plan);
  const bl = badLunch.routes.find((r) => r.lunch)!;
  bl.lunch = { start: '14:00', end: '15:00' };
  assert.ok(verifyPlan(badLunch, data, travel).totalViolations > 0);
});

// Zusatz `totals`: Was angezeigt wird, addiert sich – Fahrt + vor Ort + Pause + Warten = Arbeitstag, Summen = Einzelwerte
test('Zahlen stimmen: jede Route und die Wochensumme addieren sich exakt', () => {
  const data = fixtureData();
  const plan = buildPlan(data, { travel });
  const totals = (p: Plan) => verifyPlan(p, data, travel).rules.find((r) => r.rule === 'totals')!;
  assert.equal(totals(plan).violations.length, 0, JSON.stringify(totals(plan).violations.slice(0, 3)));
  assert.ok(totals(plan).checks > plan.routes.length);
  const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3);
  for (const r of plan.routes.filter((x) => x.stops.length)) {
    r.stops.forEach((s, i) => {
      const prevEnd = toMin(i ? r.stops[i - 1].end : r.departure);
      const pause = r.lunch && toMin(r.lunch.start) >= prevEnd && toMin(r.lunch.end) <= toMin(s.start) ? 60 : 0;
      assert.equal(toMin(s.start) - prevEnd, s.travelMinutes + pause + s.waitMinutes, `${r.technicianId} ${r.date} ${s.id}: Lücke ≠ Fahrt + Pause + Warten`);
    });
  }

  const wrongDrive = clone(plan);
  wrongDrive.routes.find((r) => r.stops.length)!.driveMinutes += 5;
  assert.ok(totals(wrongDrive).violations.length > 0, 'falsche Routen-Fahrzeit wird erkannt');
  const wrongSum = clone(plan);
  wrongSum.stats.driveMinutes += 1;
  assert.ok(totals(wrongSum).violations.length > 0, 'falsche Wochensumme wird erkannt');
  const hiddenGap = clone(plan);
  const hg = hiddenGap.routes.find((r) => r.stops.some((s) => s.waitMinutes > 0)) ?? hiddenGap.routes.find((r) => r.stops.length)!;
  hg.stops[hg.stops.length - 1].waitMinutes += 30;
  assert.ok(totals(hiddenGap).violations.length > 0, 'nicht ausgewiesene Wartezeit wird erkannt');
});

// ---- Planer-Entscheidungen ----

const decide = (d: Partial<Decision> & Pick<Decision, 'mode'>): Decision => ({ reason: 'Test', override: false, at: new Date().toISOString(), ...d });
const check = (data: Dataset, plan: Plan, decisions: Record<string, Decision>) => applyExceptions(verifyPlan(plan, data, travel), plan, decisions);
const where = (plan: Plan, id: string) => plan.routes.find((r) => r.stops.some((s) => s.id === id));

// Planer-Eingriff pin
test('Fixieren: Anfrage landet am gewählten Tag, bleibt regelkonform', () => {
  const r = req();
  const data = ds([r], [day('07:00', '19:00', '2026-11-23'), day('07:00', '19:00', '2026-11-25')]);
  const decisions = { [r.id]: decide({ mode: 'pin', technicianId: 'tech_t', date: '2026-11-25' }) };
  const plan = buildPlan(data, { travel, decisions });
  assert.equal(where(plan, r.id)?.date, '2026-11-25');
  assert.equal(check(data, plan, decisions).totalViolations, 0);
});

// Planer-Eingriff exclude
test('Aus Plan genommen: steht mit Begründung auf der Liste, nicht im Plan', () => {
  const r = req();
  const data = ds([r]);
  const decisions = { [r.id]: decide({ mode: 'exclude', reason: 'Kunde ruft zurück' }) };
  const plan = buildPlan(data, { travel, decisions });
  assert.equal(where(plan, r.id), undefined);
  assert.match(plan.unassigned.find((u) => u.requestId === r.id)!.reason, /Kunde ruft zurück/);
  assert.equal(check(data, plan, decisions).totalViolations, 0);
});

// Bewusste Ausnahmen (verify.applyExceptions)
test('Regelbruch ohne Ausnahme bleibt rot, mit Ausnahme + Begründung gelb', () => {
  // Im Gebiet, aber Kunde erst ab 11:00 auf einem Halbtag bis 12:00 – passt nicht regelkonform
  const far = req({ customerAvailableFrom: '11:00', visitationType: 'WP+PV', durationMinutes: 105 });
  const data = ds([far], [day('07:00', '12:00')]);
  const asError = { [far.id]: decide({ mode: 'pin', technicianId: 'tech_t', date: '2026-11-23', override: false }) };
  const v1 = check(data, buildPlan(data, { travel, decisions: asError }), asError);
  assert.ok(v1.totalViolations > 0, 'ohne Ausnahme: Fehler');

  const asException = { [far.id]: decide({ mode: 'pin', technicianId: 'tech_t', date: '2026-11-23', override: true, reason: 'Kunde besteht darauf' }) };
  const plan = buildPlan(data, { travel, decisions: asException });
  assert.equal(where(plan, far.id)?.date, '2026-11-23', 'Planer entscheidet – Anfrage ist eingeplant');
  const v2 = check(data, plan, asException);
  assert.equal(v2.totalViolations, 0);
  assert.ok(v2.exceptions!.length > 0 && v2.exceptions!.every((e) => e.reason === 'Kunde besteht darauf'));
});

// DATEN: Uhrzeitformat („10.00“) · REGEL-4
test('Uhrzeit-Formatfehler („10.00“) wird gelesen, geplant und als Warnung mit Korrektur gemeldet', () => {
  const r = req({ customerAvailableFrom: '10.00' });
  const data = ds([r]);
  const plan = buildPlan(data, { travel });
  const stop = plan.routes.flatMap((x) => x.stops).find((s) => s.id === r.id);
  assert.ok(stop && stop.start >= '10:00', 'eingeplant, frühestens 10:00');
  const issue = validateDataset(data).find((i) => i.entityId === r.id && i.field === 'customerAvailableFrom');
  assert.equal(issue?.severity, 'warning');
  assert.equal(issue?.suggestion, '10:00');
  for (const [raw, want] of [['10,00', '10:00'], ['9h', '09:00'], ['ab 14 Uhr', '14:00'], ['1430', '14:30'], ['10:00:00', '10:00'], ['25:00', null], ['morgens', null]] as const)
    assert.equal(normalizeTime(raw), want, raw);
});

// DATEN: Freitext-Notizen sind Information für den Planer, keine Planungsregel
test('Notiz („nur vormittags erreichbar“) blockiert nichts: Anfrage wird normal eingeplant', () => {
  const r = req({ notes: 'nur vormittags erreichbar' });
  const plan = buildPlan(ds([r]), { travel });
  assert.ok(where(plan, r.id));
  assert.equal(plan.unassigned.length, 0);
});

// REGEL-3 · ANNAHME: Pause hat Vorrang
test('Mittagspause wird nie für einen weiteren Besuch geopfert', () => {
  // Ganzer Tag, viele kurze Besuche: ohne die Regel würde der Tag durchgehend gefüllt
  const rs = Array.from({ length: 12 }, (_, i) => req({ createdAt: `2026-11-0${(i % 9) + 1}T0${i % 10}:00:00+01:00`, visitationType: 'PV', durationMinutes: 60 }));
  const data = ds(rs, [day('07:00', '19:00')]);
  const plan = buildPlan(data, { travel });
  const r = plan.routes[0];
  assert.ok(r.stops.length > 0);
  assert.ok(r.lunch, 'ganzer Tag mit Besuchen hat eine Mittagspause');
  assert.equal(check(data, plan, {}).totalViolations, 0);
});

// REGEL-8: Tausch-Durchgang Phase 4b + Prüfung `priority`
test('Ältere zuerst: wartende ältere ersetzt eine jüngere, wenn sie regelkonform passt; Prüfung erkennt Verstöße', () => {
  // Kurzes Fenster: Platz für genau einen 105-min-Termin. Die jüngere ist kurz (60), die ältere lang (105).
  const older = req({ createdAt: '2026-11-01T09:00:00+01:00', visitationType: 'WP+PV', durationMinutes: 105 });
  const younger = req({ createdAt: '2026-11-09T09:00:00+01:00', visitationType: 'PV', durationMinutes: 60 });
  const data = ds([older, younger], [day('07:00', '09:30')]);
  const plan = buildPlan(data, { travel });
  assert.ok(where(plan, older.id), 'ältere eingeplant');
  assert.ok(!where(plan, younger.id), 'jüngere wartet');
  assert.equal(check(data, plan, {}).totalViolations, 0);

  // Manipulierter Plan: jüngere drin, ältere wartet → Prüfung muss das als Verstoß melden
  const bad = buildPlan(data, { travel, decisions: { [older.id]: decide({ mode: 'exclude', reason: 'x' }) } });
  const swapped = { ...bad, unassigned: [{ requestId: older.id, reason: 'Kapazität erschöpft (Warteliste)' }] };
  const v = verifyPlan(swapped, data, travel);
  assert.ok(v.rules.find((x) => x.rule === 'priority')!.violations.length > 0);
});

// Vorschau rankOptions()
test('Optionen: regelkonforme Slots zuerst, gesperrte (freigegebene) Touren am Ende', () => {
  const a = req(), b = req();
  const data = ds([a, b], [day('07:00', '19:00', '2026-11-23'), day('07:00', '19:00', '2026-11-24')]);
  const first = buildPlan(data, { travel });
  const r = where(first, a.id)!;
  const approvals = { [`tech_t@${r.date}`]: { at: 'x', stops: r.stops.map((s) => ({ id: s.id, start: s.start })) } };
  const plan = buildPlan(data, { travel, approvals });
  const options = rankOptions(data, plan, b.id, { travel });
  assert.ok(options.length >= 2);
  assert.ok(!options[0].blocked && options[0].warnings.length === 0);
  assert.ok(options[options.length - 1].blocked || options.every((o) => !o.blocked));
});

// DATEN: Fehler blockieren, Korrektur entsperrt
test('Datenfehler sperren die Planung – auch fixiert; nach Korrektur wird geplant', () => {
  const bad = req({ customerAvailableFrom: '25:99' }); // nicht lesbare Uhrzeit = Fehler
  const decisions = { [bad.id]: decide({ mode: 'pin', technicianId: 'tech_t', date: '2026-11-23', override: true }) };
  const plan = buildPlan(ds([bad]), { travel, decisions });
  assert.equal(where(plan, bad.id), undefined);
  assert.match(plan.unassigned.find((u) => u.requestId === bad.id)!.reason, /^Datenfehler/);
  assert.equal(verifyPlan(plan, ds([bad]), travel).totalViolations, 0);

  const fixed = { ...bad, customerAvailableFrom: '10:00' };
  const after = buildPlan(ds([fixed]), { travel });
  assert.ok(where(after, bad.id), 'nach Korrektur eingeplant');
});

// Vergleich Handplanung (baselinePlan) – Grundlage der Ersparnis-Anzeige
test('Baseline: Handplanung hängt hinten an – Planer fährt weniger für dieselben Besuche', () => {
  // Wohnort Wien; Reihenfolge nach Eingang springt hin und her (Ost, West, Ost, West)
  const east = (d: string) => req({ createdAt: d, lat: 48.21, lng: 16.55, visitationType: 'PV', durationMinutes: 60 });
  const west = (d: string) => req({ createdAt: d, lat: 48.21, lng: 16.2, visitationType: 'PV', durationMinutes: 60 });
  const data = ds([east('2026-11-01T09:00:00+01:00'), west('2026-11-02T09:00:00+01:00'), east('2026-11-03T09:00:00+01:00'), west('2026-11-04T09:00:00+01:00')]);
  const plan = buildPlan(data, { travel });
  const base = baselinePlan(data, travel);
  assert.equal(base.planned, 4);
  assert.equal(plan.stats.planned, 4);
  assert.ok(plan.stats.driveMinutes < base.driveMinutes, `Planer ${plan.stats.driveMinutes} min < Handplanung ${base.driveMinutes} min`);
  assert.deepEqual(plan.stats.baseline, base);
});

test('Baseline auf dem Gesamtdatensatz: Planer plant mindestens so viele Besuche', () => {
  const data = fixtureData();
  const plan = buildPlan(data, { travel });
  console.log('# baseline', JSON.stringify({ plan: [plan.stats.planned, plan.stats.driveMinutes], hand: plan.stats.baseline }));
  assert.ok(plan.stats.planned >= plan.stats.baseline.planned);
});

// REGEL-2: Termin inkl. Anfahrt ganz im Fenster – nur die Heimfahrt darf bis 60 min darüber
test('Fenster: Termin muss im Fenster enden, Heimfahrt darf bis 60 min drüber', () => {
  // A) Termin endet genau 12:00, Heimfahrt ~7 min danach → erlaubt
  const a = req({ customerAvailableFrom: '10:45' });
  const planA = buildPlan(ds([a], [day('07:00', '12:00')]), { travel });
  const routeA = where(planA, a.id);
  assert.ok(routeA, 'A wird eingeplant');
  assert.equal(routeA!.stops[0].end, '12:00');
  assert.ok(routeA!.returnHome > '12:00' && routeA!.returnHome <= '13:00', `Heimkehr ${routeA!.returnHome}`);
  assert.equal(verifyPlan(planA, ds([a], [day('07:00', '12:00')]), travel).totalViolations, 0);

  // B) Termin würde 12:05 enden → nicht erlaubt (nur die Heimfahrt hat Toleranz)
  const b = req({ customerAvailableFrom: '10:50' });
  assert.equal(where(buildPlan(ds([b], [day('07:00', '12:00')]), { travel }), b.id), undefined);
});

// REGEL-2 · DATEN: Heimfahrt > 60 min über Fensterende → passt nie → eigener Grund statt „Kapazität“
test('Heimfahrt über +60 min: nicht eingeplant und als „Passt in keinen Tag“ begründet', () => {
  const austria = [{ lat: 49, lng: 9 }, { lat: 49, lng: 17.5 }, { lat: 46.3, lng: 17.5 }, { lat: 46.3, lng: 9 }];
  const graz = { lat: 47.07, lng: 15.44, address: 'Herrengasse 1, 8010 Graz', visitationType: 'PV' as const, durationMinutes: 60 };
  const late = req({ ...graz, customerAvailableFrom: '17:00' });
  const data = ds([late], [day('12:00', '19:00')], [tech({ region: austria })]);
  const plan = buildPlan(data, { travel });
  assert.equal(where(plan, late.id), undefined);
  assert.match(plan.unassigned.find((u) => u.requestId === late.id)!.reason, /^Passt in keinen Tag: Heimkehr/);

  // Ohne Kundenzeit passt dieselbe Anfrage – Heimkehr bleibt innerhalb der Toleranz
  const free = req({ ...graz });
  const ok = buildPlan(ds([free], [day('12:00', '19:00')], [tech({ region: austria })]), { travel });
  const r = where(ok, free.id);
  assert.ok(r, 'ohne Kundenzeit eingeplant');
  assert.ok(r!.returnHome <= '20:00', `Heimkehr ${r!.returnHome}`);
});
