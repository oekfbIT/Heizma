/**
 * @file      Planner.tsx – Hauptansicht „Routenplanung“: Tag wählen → Route prüfen → freigeben
 * @layer     Web · View (Seite) – spricht nur mit dem CoreInteractor (useCore), nie direkt mit fetch
 * @route     /planer (?week=N für Prognose-Wochen, nur lesen)
 * @nutzt     routen/techniker/anfragen/termine-Interactor · components/planner/* (Karte, Timeline, KPIs, Prüf-Badge)
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/02-architektur.md · docs/10-code-navigation.md
 *
 * Aufbau dieser Datei: State → Laden → Abgeleitete Werte → Aktionen → Render (Sidebar | Karte | Mobil-Umschalter)
 */
import { Link, useSearchParams } from 'react-router-dom';
import WeekSwitcher from '@/components/WeekSwitcher';
import { CapacityLegend } from '@/components/planner/CapacityBar';
import { useEffect, useMemo, useState } from 'react';
import PlanKpis from '@/components/planner/PlanKpis';
import RouteMap from '@/components/planner/RouteMap';
import StopDetailsModal from '@/components/planner/StopDetailsModal';
import StopTimeline from '@/components/planner/StopTimeline';
import TechnicianCell from '@/components/planner/TechnicianCell';
import VerificationBadge from '@/components/planner/VerificationBadge';
import RegionFilter from '@/components/stammdaten/RegionFilter';
import { useResizableSidebar } from '@/hooks/useResizableSidebar';
import { useCore, useResource } from '@/core';
import { formatDay, formatMinutes, isoWeek } from '@/lib/format';
import { NO_REGION, regionLabel, useRegion } from '@/lib/regions';
import { ROUTE_LEVEL, type RouteGeometry } from '@/modules';
import type { Plan } from '@/lib/types';
import { Alert, Button, ErrorBox, Icon, IconButton, Loading } from '@/ui';

/**
 * Planer in drei Schritten: 1. Tag wählen → 2. Routen prüfen → 3. freigeben.
 * Links die Liste, rechts die Karte. Klick auf einen Stopp zoomt hin und öffnet das Popover.
 */
export default function Planner() {
  // MARK: - Daten (Resources) & UI-State
  const core = useCore();
  const { routen, techniker, anfragen, termine } = core;
  const plan = useResource(routen.plan);
  const team = useResource(techniker.data);
  const requests = useResource(anfragen.data);
  useResource(termine.data);
  const meta = useResource(core.system.meta);
  const forecast = useResource(core.system.forecast);
  // Woche: 0 = echte Planung, ab 1 = Prognose der Warteliste (nur lesen)
  const [params, setParams] = useSearchParams();
  const week = Math.max(0, Number(params.get('week') ?? 0) || 0);
  const [projected, setProjected] = useState<{ week: number; plan: Plan } | null>(null);
  const [projError, setProjError] = useState<string | null>(null);

  const [day, setDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [detailsStopId, setDetailsStopId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [busy, setBusy] = useState(false);
  const sidebar = useResizableSidebar();
  const [actionError, setActionError] = useState<string | null>(null);
  const [region, setRegion] = useRegion();
  // Mobil: Liste und Karte im Wechsel (Karte bleibt gemountet, damit sie sauber rendert)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  // MARK: - Laden (Prognose-Woche, Tage, Geometrie)
  useEffect(() => {
    setProjError(null);
    if (!week) return;
    routen
      .projected(week)
      .then((pl) => setProjected({ week, plan: pl }))
      .catch((e: Error) => setProjError(e.message));
  }, [routen, week, forecast.data]);
  const isProjection = week > 0;
  const activePlan = isProjection ? (projected?.week === week ? projected.plan : null) : plan.data;

  // Tage der gewählten Woche (Prognose: aus den projizierten Routen)
  const realDays = useMemo(() => techniker.days(), [techniker, team.data]);
  const days = useMemo(
    () => (isProjection ? [...new Set((activePlan?.routes ?? []).map((r) => r.date))].sort() : realDays),
    [isProjection, activePlan, realDays],
  );
  useEffect(() => {
    if (days.length && (!day || !days.includes(day))) setDay(days[0]);
  }, [day, days]);
  const changeWeek = (w: number) => {
    setParams(w ? { week: String(w) } : {});
    setSelectedId(null);
    setSelectedStopId(null);
  };

  // Straßengeometrie nur für die ausgewählte Route laden (spart API-Calls)
  useEffect(() => {
    setGeometry(null);
    if (!selectedId || !day || isProjection) return;
    routen.geometry(selectedId, day).then(setGeometry).catch(() => setGeometry(null));
  }, [routen, selectedId, day, isProjection]);

  const loadError = plan.error ?? team.error ?? requests.error ?? projError;
  if (loadError) return <ErrorBox message={loadError} onRetry={() => { plan.reload(); team.reload(); requests.reload(); }} />;
  if (!activePlan || !team.data || !requests.data || !day) return <Loading label={isProjection ? 'Vorplanung wird berechnet …' : 'Routenplanung wird berechnet …'} />;

  // MARK: - Abgeleitete Werte (Region-Filter, Routen des Tages, Warteliste)
  const p = activePlan;
  const technicians = techniker.list();
  const colors = techniker.colors();
  const inRegion = (techId: string) => !region || (region !== NO_REGION && techId === region);
  const visibleTechs = technicians.filter((t) => inRegion(t.id));
  const dayRoutes = routen.routesOn(p, day, inRegion);
  // Eine Quelle für alle Zähler: Bilanz (auf Region gefiltert) – Teile ergeben die Gesamtzahl
  const bal = core.balance(p, region ? (id) => anfragen.inRegion(id, region) : undefined);
  const notThisWeek = bal.total - bal.thisWeek;
  const selectedRoute = dayRoutes.find((r) => r.technicianId === selectedId);
  const selectedTech = selectedId ? techniker.byId(selectedId) : undefined;
  const violationsFor = (techId: string, date = day) => routen.violationsFor(p, techId, date);

  // MARK: - Aktionen: der CoreInteractor lädt danach alles Sichtbare neu
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const toggleApproval = (techId: string, approved: boolean) => run(() => core.approveRoute(techId, day, approved));
  const openRoutes = dayRoutes.filter((r) => r.stops.length && !r.approved);
  const approveDay = () => run(() => core.approveDay(day));

  const selectTech = (techId: string | null) => {
    setSelectedId(techId);
    setSelectedStopId(null);
  };
  const selectStop = (techId: string, stopId: string | null) => {
    setSelectedId(techId);
    setSelectedStopId(stopId);
    if (stopId) setMobileView('map');
  };

  // Details-Dialog
  const detailsRoute = detailsStopId ? p.routes.find((r) => r.stops.some((s) => s.id === detailsStopId)) : null;
  const detailsIndex = detailsRoute ? detailsRoute.stops.findIndex((s) => s.id === detailsStopId) : -1;
  const detailsTech = detailsRoute ? techniker.byId(detailsRoute.technicianId) : null;

  const dayStatus = (date: string) => routen.dayStatus(p, date, inRegion);
  const today = dayStatus(day);

  // MARK: - Render
  return (
    <div className="relative flex h-[calc(100dvh-60px)] overflow-hidden md:h-[calc(100vh-72px)]">
      {/* MARK: - Sidebar */}
      <aside
        className={`${mobileView === 'list' ? 'flex' : 'hidden'} absolute inset-0 z-sidebar w-full flex-col bg-white md:relative md:z-auto md:flex md:w-[var(--sidebar-w)] md:shrink-0 md:border-r md:border-gray-200`}
        style={{ '--sidebar-w': sidebar.width } as React.CSSProperties}
      >
        {/* Kopf: was ist der Stand? */}
        <div className="border-b border-gray-100 px-4 pb-3 pt-4 md:px-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Routenplanung</h1>
            <IconButton icon="refresh" label="Daten neu laden und neu planen" onClick={() => void run(() => core.reloadAll())} />
          </div>
          {forecast.data && forecast.data.weeks.length > 1 && <WeekSwitcher className="mt-2" weeks={forecast.data.weeks} value={week} onChange={changeWeek} />}
          {isProjection ? (
            <>
              <p className="mt-0.5 text-sm text-gray-600">
                <strong>{p.stats.planned}</strong> von {p.stats.planned + p.stats.unassigned} übrigen Anfragen sind vorgeplant
                {p.stats.unassigned > 0 && <>, {p.stats.unassigned} warten</>}.
              </p>
              <p className="mt-1.5 rounded-lg bg-info-50 px-2.5 py-1.5 text-xs text-info-800">
                <strong>Vorläufig:</strong> Anfragen, die in den Wochen davor keinen Platz haben. Verfügbarkeit wie diese Woche angenommen – in Produktion
                kommt sie aus der API. Freigabe, sobald die echte Verfügbarkeit vorliegt.
              </p>
            </>
          ) : (
          <p className="mt-0.5 text-sm text-gray-600">
            Diese Woche <strong>{bal.thisWeek}</strong> von {bal.total} Anfragen eingeplant
            {bal.preplanned > 0 && <> · {bal.preplanned} vorgeplant</>}
            {bal.waitlist > 0 && <> · {bal.waitlist} Warteliste</>}
            {bal.unplannable > 0 && <> · <span className="text-danger-600">{bal.unplannable} nicht planbar</span></>}
            {bal.excluded > 0 && <> · {bal.excluded} aus dem Plan</>}
          </p>
          )}
          <div className="mt-2">
            <VerificationBadge
              plan={p}
              onSelect={(techId, date) => {
                setDay(date);
                selectTech(techId);
                setMobileView('list');
              }}
            />
          </div>

          {/* Schritt 1 */}
          <Step n={1} title="Tag wählen" />
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
            {days.map((date) => {
              const st = dayStatus(date);
              const active = date === day;
              return (
                <button
                  key={date}
                  onClick={() => {
                    setDay(date);
                    selectTech(null);
                  }}
                  className={`min-w-[78px] shrink-0 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    active ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="block font-semibold">{formatDay(date)}</span>
                  <span className={active ? 'text-white/85' : st.done ? 'font-medium text-brand-600' : 'text-gray-400'}>
                    {routen.dayStatusLabel(st)}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2">
            <RegionFilter compact technicians={technicians} colors={colors} value={region} onChange={(v) => { setRegion(v); selectTech(null); }} />
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 md:px-5">
          {selectedRoute && selectedTech ? (
            <>
              <button onClick={() => selectTech(null)} className="back-link mb-2">
                <Icon name="back" className="h-4 w-4" /> Alle Personen am {formatDay(day)}
              </button>
              <div className="mb-3 flex items-center gap-3">
                <span className="h-3 w-3 rounded-full" style={{ background: colors[selectedTech.id] }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{selectedTech.name}</p>
                  <p className="text-xs text-gray-500">
                    {selectedRoute.stops.length} Termine · {formatMinutes(selectedRoute.driveMinutes)} Fahrt · verfügbar {selectedRoute.window.start}–{selectedRoute.window.end}
                  </p>
                </div>
              </div>
              <Step n={2} title="Route prüfen" hint="Ein Klick auf einen Termin zeigt ihn auf der Karte." />
              <div className="mt-2">
                <StopTimeline
                  route={selectedRoute}
                  technician={selectedTech}
                  color={colors[selectedTech.id]}
                  selectedStopId={selectedStopId}
                  hoveredStopId={hoveredStopId}
                  onSelectStop={(id) => selectStop(selectedTech.id, id)}
                  onHover={setHoveredStopId}
                  violations={violationsFor(selectedTech.id)}
                  exceptions={routen.exceptionIds(p)}
                  noteFor={(id) => anfragen.noteFor(id)}
                />
              </div>
              {violationsFor(selectedTech.id).get(ROUTE_LEVEL)?.map((m) => (
                <p key={m} className="mt-2 text-xs font-medium text-danger-600">
                  ⚠ {m}
                </p>
              ))}
            </>
          ) : (
            <>
              <Step n={2} title="Routen prüfen" hint="Ein Klick auf eine Person zeigt ihre Tagesroute." />
              <CapacityLegend />
              <div className="mt-2 space-y-2">
                {visibleTechs.map((t) => {
                  const r = dayRoutes.find((x) => x.technicianId === t.id);
                  return (
                    <TechnicianCell
                      key={t.id}
                      technician={t}
                      route={r}
                      status={isProjection ? (r ? 'available' : 'none') : techniker.statusOn(t.id, day)}
                      color={colors[t.id]}
                      selected={false}
                      approved={!!r?.approved}
                      hasViolation={violationsFor(t.id).size > 0}
                      onClick={() => selectTech(t.id)}
                    />
                  );
                })}
              </div>
              {region === NO_REGION && (
                <Alert tone="neutral" size="sm" className="mt-3 rounded-lg px-3 py-2">
                  Nicht zuordenbare Anfragen (in keinem Gebiet und &gt; 15 km von jedem Wohnort) – nur intern lösbar.
                </Alert>
              )}
              {notThisWeek > 0 && (
                <Link to="/stammdaten/anfragen" className="mt-5 flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <span>
                    <b className="text-ink">{notThisWeek}</b> nicht in dieser Woche:{' '}
                    {[bal.preplanned && `${bal.preplanned} vorgeplant`, bal.waitlist && `${bal.waitlist} Warteliste`, bal.unplannable && `${bal.unplannable} nicht planbar`, bal.excluded && `${bal.excluded} aus dem Plan`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="text-brand-600">→</span>
                </Link>
              )}
              <details className="mt-4 rounded-xl border border-gray-200 px-3 py-2">
                <summary className="cursor-pointer text-sm font-medium text-gray-700">Planqualität & Fahrzeiten</summary>
                <PlanKpis plan={p} />
              </details>
            </>
          )}
        </div>

        {/* Schritt 3 – immer unten sichtbar */}
        <div className="border-t border-gray-200 bg-white px-4 pb-20 pt-3 md:px-5 md:pb-4">
          {actionError && (
            <Alert tone="danger" size="sm" className="mb-2">
              {actionError}
            </Alert>
          )}
          {isProjection ? (
            <p className="text-center text-xs text-gray-500">
              Vorgeplante Woche – freigeben, sobald die echte Verfügbarkeit dieser Woche vorliegt.{' '}
              <button className="font-medium text-brand-600 hover:underline" onClick={() => changeWeek(0)}>
                Zur aktuellen Woche
              </button>
            </p>
          ) : selectedRoute && selectedTech ? (
            (() => {
              const bad = violationsFor(selectedTech.id).size > 0;
              const approved = !!selectedRoute.approved;
              return (
                <>
                  <p className="mb-2 text-xs text-gray-500">
                    {approved
                      ? `Freigegeben – Reihenfolge und Zeiten bleiben bei Neuplanung erhalten.`
                      : bad
                        ? 'Diese Route verletzt eine Regel und kann nicht freigegeben werden.'
                        : routen.hasException(p, selectedTech.id, day)
                          ? 'Enthält eine bewusste Ausnahme (gelb, mit Begründung) – Freigabe möglich.'
                          : 'Passt alles? Dann freigeben – die Route wird für die Neuplanung gesperrt.'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant={approved ? 'secondary' : 'primary'}
                      className="flex-1"
                      onClick={() => toggleApproval(selectedTech.id, approved)}
                      disabled={busy || !selectedRoute.stops.length || (!approved && bad)}
                    >
                      {approved ? 'Freigabe zurücknehmen' : `3. Route von ${selectedTech.name} freigeben`}
                    </Button>
                    {approved && (
                      <Button icon="calendar" title="Als Kalenderdatei (.ics) für den Außendienst herunterladen" onClick={() => void routen.downloadIcs(selectedTech.id, day)}>
                        Kalender
                      </Button>
                    )}
                  </div>
                </>
              );
            })()
          ) : today.done ? (
            <Alert tone="success" className="rounded-lg border-0 px-3 py-2.5 text-center font-medium">
              ✓ Alle Routen am {formatDay(day)} sind freigegeben
            </Alert>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-500">
                {today.approved}/{today.total} Routen freigegeben. Routen mit Regelverstoß werden übersprungen.
              </p>
              <Button variant="primary" block icon="lock" onClick={approveDay} disabled={busy || !openRoutes.length}>
                3. {openRoutes.length} {openRoutes.length === 1 ? 'Route' : 'Routen'} am {formatDay(day)} freigeben
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* Ziehgriff: Breite der Sidebar anpassen, Doppelklick = zurück auf 40 % */}
      <div
        role="separator"
        aria-orientation="vertical"
        title="Ziehen zum Anpassen · Doppelklick: zurücksetzen"
        onPointerDown={sidebar.startDrag}
        onDoubleClick={sidebar.reset}
        className={`group relative z-map-overlay hidden w-1.5 shrink-0 -ml-[3px] -mr-[3px] cursor-col-resize md:block ${sidebar.dragging ? 'bg-brand-500/50' : 'hover:bg-brand-500/30'}`}
      />

      {/* MARK: - Karte */}
      <section className={`absolute inset-0 md:relative md:inset-auto md:min-w-0 md:flex-1 ${sidebar.dragging ? 'pointer-events-none' : ''}`}>
        <RouteMap
          routes={dayRoutes}
          technicians={visibleTechs}
          colors={colors}
          selectedId={selectedId}
          geometry={geometry}
          office={meta.data?.office ?? null}
          hoveredStopId={hoveredStopId}
          onSelect={selectTech}
          onHoverStop={setHoveredStopId}
          selectedStopId={selectedStopId}
          onSelectStop={selectStop}
          onOpenDetails={setDetailsStopId}
        />
        <div className="pointer-events-none absolute left-3 top-3 z-map-overlay max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-md md:left-4 md:top-4">
          {isProjection && <span className="mr-1 rounded bg-info-100 px-1.5 py-0.5 text-[11px] font-semibold text-info-700">Vorgeplant · KW {p.routes[0] ? isoWeek(p.routes[0].date) : ''}</span>}
          {formatDay(day)} · {selectedTech ? selectedTech.name : `${dayRoutes.filter((r) => r.stops.length).length} Routen`}
          {region && !selectedTech && ` · ${region === NO_REGION ? 'Ohne Zuständigkeit' : `Region ${regionLabel(techniker.byId(region)!)}`}`}
        </div>
        {/* Legende */}
        <div className="pointer-events-none absolute bottom-6 right-3 z-map-overlay hidden rounded-lg bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow md:block">
          <p className="flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">1</span> Reihenfolge der Termine</p>
          <p className="mt-1 flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded bg-ink" /> fixer Termin 🔒 <span className="text-gray-400">(nicht verschiebbar)</span></p>
          <p className="mt-1 flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded border-2 border-brand-500 bg-white" /> Wohnort (Start & Ende)</p>
        </div>
      </section>

      {/* Mobil: Umschalter Liste ⇄ Karte */}
      <button
        onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
        className="absolute bottom-5 left-1/2 z-floating flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-xl md:hidden"
      >
        <Icon name={mobileView === 'list' ? 'route' : 'inbox'} className="h-4 w-4" />
        {mobileView === 'list' ? 'Karte' : 'Liste'}
      </button>

      {!isProjection && detailsRoute && detailsTech && detailsIndex >= 0 && (
        <StopDetailsModal
          stop={detailsRoute.stops[detailsIndex]}
          index={detailsIndex}
          route={detailsRoute}
          technician={detailsTech}
          color={colors[detailsTech.id]}
          request={anfragen.byId(detailsStopId!)}
          appointment={termine.byId(detailsStopId!)}
          violations={violationsFor(detailsTech.id, detailsRoute.date).get(detailsStopId!) ?? []}
          onPlanChanged={() => {
            // Stopp kann in eine andere Route gewandert sein → Dialog schließen (Neuladen macht der CoreInteractor)
            setDetailsStopId(null);
          }}
          onClose={() => setDetailsStopId(null)}
        />
      )}
    </div>
  );
}

function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mt-3 flex items-baseline gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-bold text-white">{n}</span>
      <span className="text-sm font-semibold">{title}</span>
      {hint && <span className="truncate text-xs text-gray-400">{hint}</span>}
    </div>
  );
}
