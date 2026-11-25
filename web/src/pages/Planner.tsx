import { useEffect, useMemo, useState } from 'react';
import RouteMap from '@/components/planner/RouteMap';
import StopTimeline from '@/components/planner/StopTimeline';
import TechnicianCell from '@/components/planner/TechnicianCell';
import Waitlist from '@/components/planner/Waitlist';
import Icon from '@/components/ui/Icon';
import RegionFilter from '@/components/ui/RegionFilter';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { apiGet, reloadData, useApi, type Meta, type RouteGeometry, type Stammdaten } from '@/lib/api';
import { formatDay, formatMinutes, technicianColor } from '@/lib/format';
import { NO_REGION, regionLabel, requestInRegion, useRegion } from '@/lib/regions';
import type { Plan } from '@/lib/types';

/**
 * Planer-Ansicht im Google-Maps-Stil:
 * links Sidebar (Tage, Techniker, Tagesablauf, Warteliste), rechts die Karte.
 */
export default function Planner() {
  const plan = useApi<Plan>('/api/plan');
  const stamm = useApi<Stammdaten>('/api/stammdaten');
  const meta = useApi<Meta>('/api/meta');

  const [day, setDay] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredStopId, setHoveredStopId] = useState<string | null>(null);
  const [geometry, setGeometry] = useState<RouteGeometry | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState<Set<string>>(new Set()); // key: techId@date
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
  // Regionsfilter: ein Techniker = ein Einsatzgebiet
  const inRegion = (techId: string) => !region || (region !== NO_REGION && techId === region);
  const visibleTechs = d.technicians.filter((t) => inRegion(t.id));
  const dayRoutes = p.routes.filter((r) => r.date === day && inRegion(r.technicianId));
  const waitlist = p.unassigned.filter((u) => requestInRegion(d, u.requestId, region));
  const selectedRoute = dayRoutes.find((r) => r.technicianId === selectedId);
  const selectedTech = d.technicians.find((t) => t.id === selectedId);
  const dayStops = dayRoutes.reduce((n, r) => n + r.stops.length, 0);
  const dayDrive = dayRoutes.reduce((n, r) => n + r.driveMinutes, 0);

  const statusFor = (techId: string): 'available' | 'blocked' | 'none' => {
    const entry = d.availability.find((a) => a.technicianId === techId && a.date === day);
    if (!entry) return 'none';
    return entry.blocked ? 'blocked' : 'available';
  };

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  return (
    <div className="relative flex h-[calc(100dvh-60px)] overflow-hidden md:h-[calc(100vh-72px)]">
      {/* ---------- Sidebar (mobil: Vollbild über der Karte) ---------- */}
      <aside
        className={`${mobileView === 'list' ? 'flex' : 'hidden'} absolute inset-0 z-[850] w-full flex-col bg-white md:relative md:z-auto md:flex md:w-[400px] md:shrink-0 md:border-r md:border-gray-200`}
      >
        <div className="border-b border-gray-100 px-4 pb-3 pt-4 md:px-5 md:pb-4 md:pt-5">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Routenplanung</h1>
            <button
              className="text-gray-400 transition hover:text-brand-600"
              title="Daten neu laden"
              onClick={async () => {
                await reloadData();
                plan.reload();
                stamm.reload();
              }}
            >
              <Icon name="refresh" className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {p.stats.planned} / {p.stats.totalRequests} Anfragen eingeplant · Fahrzeiten geschätzt (Entwurf)
          </p>

          {/* Tage */}
          <div className="mt-4 flex gap-1.5 overflow-x-auto">
            {days.map((date) => {
              const stops = p.routes.filter((r) => r.date === date && inRegion(r.technicianId)).reduce((n, r) => n + r.stops.length, 0);
              return (
                <button
                  key={date}
                  onClick={() => {
                    setDay(date);
                    setSelectedId(null);
                  }}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                    date === day ? 'border-brand-500 bg-brand-500 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <span className="block font-semibold">{formatDay(date)}</span>
                  <span className={date === day ? 'text-white/80' : 'text-gray-400'}>{stops} Stopps</span>
                </button>
              );
            })}
          </div>

          {/* Regionen */}
          <div className="mt-3">
            <RegionFilter
              compact
              technicians={d.technicians}
              colors={colors}
              value={region}
              onChange={(v) => {
                setRegion(v);
                setSelectedId(null);
              }}
            />
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 pb-24 pt-4 md:px-5 md:pb-4">
          {selectedRoute && selectedTech ? (
            <>
              <button onClick={() => setSelectedId(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
                <Icon name="back" className="h-4 w-4" /> Alle Techniker
              </button>
              <TechnicianCell
                technician={selectedTech}
                route={selectedRoute}
                status="available"
                color={colors[selectedTech.id]}
                selected
                approved={approved.has(`${selectedTech.id}@${day}`)}
                onClick={() => setSelectedId(null)}
              />
              <StopTimeline
                route={selectedRoute}
                technician={selectedTech}
                color={colors[selectedTech.id]}
                checked={checked}
                hoveredStopId={hoveredStopId}
                onToggle={(id) => setChecked(toggle(checked, id))}
                onHover={setHoveredStopId}
                approved={approved.has(`${selectedTech.id}@${day}`)}
                onApprove={() => setApproved(toggle(approved, `${selectedTech.id}@${day}`))}
              />
              {geometry && (
                <p className="text-xs text-gray-400">
                  Straßenverlauf: {geometry.legs.some((l) => l.polyline) ? 'Heizma /travel/path' : 'Luftlinie (Mock-Modus)'}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>
                  {dayStops} Stopps · {formatMinutes(dayDrive)} Fahrzeit
                </span>
                <span>{approved.size ? `${[...approved].filter((k) => k.endsWith(day)).length} freigegeben` : ''}</span>
              </div>
              <div className="space-y-2">
                {visibleTechs.map((t) => (
                  <TechnicianCell
                    key={t.id}
                    technician={t}
                    route={dayRoutes.find((r) => r.technicianId === t.id)}
                    status={statusFor(t.id)}
                    color={colors[t.id]}
                    selected={false}
                    approved={approved.has(`${t.id}@${day}`)}
                    onClick={() => setSelectedId(t.id)}
                  />
                ))}
              </div>
              {region === NO_REGION && (
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                  Anfragen ohne zuständigen Techniker (kein Gebiet, &gt; 15 km vom Wohnort) – nur intern lösbar.
                </p>
              )}
              <Waitlist
                items={waitlist}
                requests={d.requests}
                escalations={d.escalations ?? {}}
                nextWorkday={meta.data?.nextWorkday ?? d.range.to}
                onChanged={() => stamm.reload()}
              />
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
          onSelect={setSelectedId}
          onHoverStop={setHoveredStopId}
        />
        {/* Mobil: gewählte Tour als Karte unten, Tipp öffnet den Tagesablauf */}
        {selectedTech && selectedRoute && mobileView === 'map' && (
          <button
            onClick={() => setMobileView('list')}
            className="absolute inset-x-3 bottom-20 z-[500] flex items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-xl md:hidden"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ background: colors[selectedTech.id] }}>
              {selectedRoute.stops.length}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{selectedTech.name}</span>
              <span className="block text-xs text-gray-500">
                {selectedRoute.departure}–{selectedRoute.returnHome} · 🚗 {formatMinutes(selectedRoute.driveMinutes)}
              </span>
            </span>
            <span className="text-xs font-semibold text-brand-600">Ablauf ›</span>
          </button>
        )}
        <div className="pointer-events-none absolute left-3 top-3 z-[500] max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-md md:left-4 md:top-4">
          {formatDay(day)} · {selectedTech ? selectedTech.name : `${dayRoutes.length} Touren`}
          {region && !selectedTech && ` · ${region === NO_REGION ? 'Ohne Zuständigkeit' : `Region ${regionLabel(d.technicians.find((t) => t.id === region)!)}`}`}
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
    </div>
  );
}
