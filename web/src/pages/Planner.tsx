import { Link } from 'react-router-dom';
import { CapacityLegend } from '@/components/planner/CapacityBar';
import { useEffect, useMemo, useState } from 'react';
import PlanKpis from '@/components/planner/PlanKpis';
import RouteMap from '@/components/planner/RouteMap';
import StopDetailsModal from '@/components/planner/StopDetailsModal';
import StopTimeline from '@/components/planner/StopTimeline';
import TechnicianCell from '@/components/planner/TechnicianCell';
import VerificationBadge from '@/components/planner/VerificationBadge';
import Icon from '@/components/ui/Icon';
import RegionFilter from '@/components/ui/RegionFilter';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { apiGet, apiSend, downloadFile, reloadData, useApi, type Meta, type NoteInfo, type RouteGeometry, type Stammdaten } from '@/lib/api';
import { formatDay, formatMinutes, technicianColor } from '@/lib/format';
import { NO_REGION, regionLabel, requestInRegion, useRegion } from '@/lib/regions';
import type { Plan } from '@/lib/types';

/**
 * Planer in drei Schritten: 1. Tag wählen → 2. Routen prüfen → 3. freigeben.
 * Links die Liste, rechts die Karte. Klick auf einen Stopp zoomt hin und öffnet das Popover.
 */
export default function Planner() {
  const plan = useApi<Plan>('/api/plan');
  const stamm = useApi<Stammdaten>('/api/stammdaten');
  const meta = useApi<Meta>('/api/meta');
  const notes = useApi<NoteInfo>('/api/notes');

  const [day, setDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [detailsStopId, setDetailsStopId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [region, setRegion] = useRegion();
  // Mobil: Liste und Karte im Wechsel (Karte bleibt gemountet, damit sie sauber rendert)
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');

  const days = useMemo(() => [...new Set(stamm.data?.availability.map((a) => a.date) ?? [])].sort(), [stamm.data]);
  useEffect(() => {
    if (!day && days.length) setDay(days[0]);
  }, [day, days]);

  // Straßengeometrie nur für die ausgewählte Route laden (spart API-Calls)
  useEffect(() => {
    setGeometry(null);
    if (!selectedId || !day) return;
    apiGet<RouteGeometry>(`/api/plan/${selectedId}/${day}/geometry`).then(setGeometry).catch(() => setGeometry(null));
  }, [selectedId, day]);

  if (plan.error || stamm.error) return <ErrorBox message={(plan.error ?? stamm.error)!} onRetry={() => { plan.reload(); stamm.reload(); }} />;
  if (!plan.data || !stamm.data || !day) return <Loading label="Tourenplan wird berechnet …" />;

  const p = plan.data;
  const d = stamm.data;
  const techIds = d.technicians.map((t) => t.id);
  const colors = Object.fromEntries(techIds.map((id) => [id, technicianColor(id, techIds)]));
  const inRegion = (techId: string) => !region || (region !== NO_REGION && techId === region);
  const visibleTechs = d.technicians.filter((t) => inRegion(t.id));
  const routesOf = (date: string) => p.routes.filter((r) => r.date === date && inRegion(r.technicianId));
  const dayRoutes = routesOf(day);
  const waitlist = p.unassigned.filter((u) => requestInRegion(d, u.requestId, region));
  const selectedRoute = dayRoutes.find((r) => r.technicianId === selectedId);
  const selectedTech = d.technicians.find((t) => t.id === selectedId);

  const allViolations = (p.verification?.rules ?? []).flatMap((r) => r.violations);
  const violationsFor = (techId: string, date = day) => {
    const m = new Map<string, string[]>();
    for (const v of allViolations) {
      if (v.technicianId !== techId || v.date !== date) continue;
      const k = v.stopId ?? '__route';
      m.set(k, [...(m.get(k) ?? []), v.message]);
    }
    return m;
  };
  const statusFor = (techId: string): 'available' | 'blocked' | 'none' => {
    const entry = d.availability.find((a) => a.technicianId === techId && a.date === day);
    if (!entry) return 'none';
    return entry.blocked ? 'blocked' : 'available';
  };

  // ---- Aktionen ----
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      plan.reload();
      stamm.reload();
      notes.reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const routeKey = (techId: string) => `${techId}@${day}`;
  const toggleApproval = (techId: string, approved: boolean) =>
    run(() => apiSend('/api/approvals', approved ? 'DELETE' : 'POST', { keys: [routeKey(techId)] }));
  const openRoutes = dayRoutes.filter((r) => r.stops.length && !r.approved);
  const approveDay = () => run(() => apiSend(`/api/approvals?date=${day}`, 'POST', {}));
  const confirmNote = (requestId: string, c: { earliest?: string; latest?: string } | null) => run(() => apiSend(`/api/notes/${requestId}/confirm`, 'POST', c ?? {}));

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
  const detailsTech = detailsRoute ? d.technicians.find((t) => t.id === detailsRoute.technicianId) : null;

  const dayStatus = (date: string) => {
    const rs = routesOf(date).filter((r) => r.stops.length);
    const approved = rs.filter((r) => r.approved).length;
    return { total: rs.length, approved, done: rs.length > 0 && approved === rs.length };
  };
  const today = dayStatus(day);

  return (
    <div className="relative flex h-[calc(100dvh-60px)] overflow-hidden md:h-[calc(100vh-72px)]">
      {/* ---------- Sidebar ---------- */}
      <aside
        className={`${mobileView === 'list' ? 'flex' : 'hidden'} absolute inset-0 z-[850] w-full flex-col bg-white md:relative md:z-auto md:flex md:w-[420px] md:shrink-0 md:border-r md:border-gray-200`}
      >
        {/* Kopf: was ist der Stand? */}
        <div className="border-b border-gray-100 px-4 pb-3 pt-4 md:px-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Routenplanung</h1>
            <button
              className="text-gray-400 transition hover:text-brand-600"
              title="Daten neu laden und neu planen"
              onClick={async () => {
                await reloadData();
                plan.reload();
                stamm.reload();
              }}
            >
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-gray-600">
            <strong>{p.stats.planned}</strong> von {p.stats.totalRequests} Anfragen sind automatisch eingeplant
            {p.stats.unassigned > 0 && <>, {p.stats.unassigned} warten</>}.
          </p>
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
                    {st.total === 0 ? 'keine Touren' : st.done ? '✓ erledigt' : `${st.total - st.approved} offen`}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-2">
            <RegionFilter compact technicians={d.technicians} colors={colors} value={region} onChange={(v) => { setRegion(v); selectTech(null); }} />
          </div>
        </div>

        {/* Inhalt */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3 md:px-5">
          {selectedRoute && selectedTech ? (
            <>
              <button onClick={() => selectTech(null)} className="mb-2 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
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
              <Step n={2} title="Tour prüfen" hint="Klick auf einen Termin zeigt ihn auf der Karte." />
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
                  exceptions={new Set((p.verification?.exceptions ?? []).map((e) => e.requestId))}
                  notes={notes.data ?? undefined}
                />
              </div>
              {violationsFor(selectedTech.id).get('__route')?.map((m) => (
                <p key={m} className="mt-2 text-xs font-medium text-red-600">
                  ⚠ {m}
                </p>
              ))}
            </>
          ) : (
            <>
              <Step n={2} title="Touren prüfen" hint="Klick auf eine Person zeigt ihre Tour." />
              <CapacityLegend />
              <div className="mt-2 space-y-2">
                {visibleTechs.map((t) => {
                  const r = dayRoutes.find((x) => x.technicianId === t.id);
                  return (
                    <TechnicianCell
                      key={t.id}
                      technician={t}
                      route={r}
                      status={statusFor(t.id)}
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
                <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Anfragen ohne zuständigen Techniker (kein Gebiet, &gt; 15 km vom Wohnort) – nur intern lösbar.
                </p>
              )}
              {waitlist.length > 0 && (
                <Link to="/stammdaten/anfragen" className="mt-5 flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50">
                  <span><b className="text-ink">{waitlist.length}</b> Anfragen nicht eingeplant – Details in den Anfragen</span>
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
          {actionError && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">{actionError}</p>}
          {selectedRoute && selectedTech ? (
            (() => {
              const bad = violationsFor(selectedTech.id).size > 0;
              const approved = !!selectedRoute.approved;
              return (
                <>
                  <p className="mb-2 text-xs text-gray-500">
                    {approved
                      ? `Freigegeben – Reihenfolge und Zeiten bleiben bei Neuplanung erhalten.`
                      : bad
                        ? 'Diese Tour verletzt eine Regel und kann nicht freigegeben werden.'
                        : (p.verification?.exceptions ?? []).some((e) => e.technicianId === selectedTech.id && e.date === day)
                          ? 'Enthält eine bewusste Ausnahme (gelb, mit Begründung) – Freigabe möglich.'
                          : 'Passt alles? Dann freigeben – die Tour wird gesperrt.'}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleApproval(selectedTech.id, approved)}
                      disabled={busy || !selectedRoute.stops.length || (!approved && bad)}
                      className={`${approved ? 'btn-secondary' : 'btn-primary'} flex-1`}
                    >
                      {approved ? 'Freigabe zurücknehmen' : `3. Tour von ${selectedTech.name} freigeben`}
                    </button>
                    {approved && (
                      <button
                        className="btn-secondary"
                        title="Als Kalenderdatei für die Techniker:in"
                        onClick={() => downloadFile(`/api/plan/${selectedTech.id}/${day}/ics`, `route-${selectedTech.id}-${day}.ics`)}
                      >
                        <Icon name="calendar" className="h-4 w-4" /> Kalender
                      </button>
                    )}
                  </div>
                </>
              );
            })()
          ) : today.done ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-center text-sm font-medium text-brand-800">✓ Alle Touren am {formatDay(day)} sind freigegeben</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-gray-500">
                {today.approved}/{today.total} Touren freigegeben. Touren mit Regelverstoß werden übersprungen.
              </p>
              <button onClick={approveDay} disabled={busy || !openRoutes.length} className="btn-primary w-full">
                <Icon name="lock" className="h-4 w-4" /> 3. {openRoutes.length} {openRoutes.length === 1 ? 'Tour' : 'Touren'} am {formatDay(day)} freigeben
              </button>
            </>
          )}
        </div>
      </aside>

      {/* ---------- Karte ---------- */}
      <section className="absolute inset-0 md:relative md:inset-auto md:flex-1">
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
        <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-md md:left-4 md:top-4">
          {formatDay(day)} · {selectedTech ? selectedTech.name : `${dayRoutes.filter((r) => r.stops.length).length} Touren`}
          {region && !selectedTech && ` · ${region === NO_REGION ? 'Ohne Zuständigkeit' : `Region ${regionLabel(d.technicians.find((t) => t.id === region)!)}`}`}
        </div>
        {/* Legende */}
        <div className="pointer-events-none absolute bottom-6 right-3 z-[500] hidden rounded-lg bg-white/95 px-3 py-2 text-[11px] text-gray-600 shadow md:block">
          <p className="flex items-center gap-1.5"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">1</span> Reihenfolge der Termine</p>
          <p className="mt-1 flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded bg-ink" /> fixer Termin 🔒 <span className="text-gray-400">(nicht verschiebbar)</span></p>
          <p className="mt-1 flex items-center gap-1.5"><span className="inline-block h-4 w-4 rounded border-2 border-brand-500 bg-white" /> Wohnort (Start & Ende)</p>
        </div>
      </section>

      {/* Mobil: Umschalter Liste ⇄ Karte */}
      <button
        onClick={() => setMobileView(mobileView === 'list' ? 'map' : 'list')}
        className="absolute bottom-5 left-1/2 z-[900] flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-xl md:hidden"
      >
        <Icon name={mobileView === 'list' ? 'route' : 'inbox'} className="h-4 w-4" />
        {mobileView === 'list' ? 'Karte' : 'Liste'}
      </button>

      {detailsRoute && detailsTech && detailsIndex >= 0 && (
        <StopDetailsModal
          stop={detailsRoute.stops[detailsIndex]}
          index={detailsIndex}
          route={detailsRoute}
          technician={detailsTech}
          color={colors[detailsTech.id]}
          request={d.requests.find((r) => r.id === detailsStopId) ?? d.convertedRequests?.find((r) => r.id === detailsStopId)}
          appointment={d.appointments.find((a) => a.id === detailsStopId && !a.simulated)}
          notes={notes.data ?? undefined}
          violations={violationsFor(detailsTech.id, detailsRoute.date).get(detailsStopId!) ?? []}
          onConfirmNote={confirmNote}
          onPlanChanged={() => {
            // Stopp kann in eine andere Tour gewandert sein → Dialog schließen, Plan neu laden
            setDetailsStopId(null);
            plan.reload();
            stamm.reload();
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
