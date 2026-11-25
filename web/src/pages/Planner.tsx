import { useEffect, useMemo, useState } from 'react';
import RouteMap from '@/components/planner/RouteMap';
import StopTimeline from '@/components/planner/StopTimeline';
import TechnicianCell from '@/components/planner/TechnicianCell';
import Waitlist from '@/components/planner/Waitlist';
import Icon from '@/components/ui/Icon';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { apiGet, reloadData, useApi, type Meta, type RouteGeometry, type Stammdaten } from '@/lib/api';
import { formatDay, formatMinutes, technicianColor } from '@/lib/format';
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
  const dayRoutes = p.routes.filter((r) => r.date === day);
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
    <div className="flex h-[calc(100vh-72px)] overflow-hidden">
      {/* ---------- Sidebar ---------- */}
      <aside className="flex w-[400px] shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-5 pb-4 pt-5">
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
              const stops = p.routes.filter((r) => r.date === date).reduce((n, r) => n + r.stops.length, 0);
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
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
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
                {d.technicians.map((t) => (
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
              {p.unassigned.length > 0 && <Waitlist items={p.unassigned} requests={d.requests} />}
            </>
          )}
        </div>
      </aside>

      {/* ---------- Karte ---------- */}
      <section className="relative flex-1">
        <RouteMap
          routes={dayRoutes}
          technicians={d.technicians}
          colors={colors}
          selectedId={selectedId}
          geometry={geometry}
          office={meta.data?.office ?? null}
          hoveredStopId={hoveredStopId}
          onSelect={setSelectedId}
          onHoverStop={setHoveredStopId}
        />
        <div className="pointer-events-none absolute left-4 top-4 z-[500] rounded-full bg-white/95 px-4 py-2 text-sm font-medium shadow-md">
          {formatDay(day)} · {selectedTech ? selectedTech.name : `${dayRoutes.length} Touren`}
        </div>
      </section>
    </div>
  );
}
