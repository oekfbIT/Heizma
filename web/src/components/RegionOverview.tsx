import { Link } from 'react-router-dom';
import { dayCapacity } from '@/components/planner/CapacityBar';
import type { Stammdaten } from '@/lib/api';
import { formatMinutes, technicianColor } from '@/lib/format';
import { NO_REGION, regionLabel } from '@/lib/regions';
import type { Plan } from '@/lib/types';

/** Auslastung je Region (= Techniker) über die Planungswoche – Klick öffnet den gefilterten Planer */
export default function RegionOverview({ data, plan }: { data: Stammdaten; plan: Plan }) {
  const techIds = data.technicians.map((t) => t.id);
  const resp = data.responsibility ?? {};
  const rows = data.technicians.map((t) => {
    const responsible = Object.entries(resp).filter(([, ids]) => ids.includes(t.id)).map(([id]) => id);
    const routes = plan.routes.filter((r) => r.technicianId === t.id);
    const planned = routes.reduce((n, r) => n + r.stops.filter((s) => s.kind === 'request').length, 0);
    const open = plan.unassigned.filter((u) => (resp[u.requestId] ?? []).includes(t.id)).length;
    const cap = routes.map(dayCapacity);
    const window = cap.reduce((n, c) => n + c.window, 0);
    const busy = cap.reduce((n, c) => n + c.busy, 0);
    return { t, responsible: responsible.length, planned, open, days: routes.length, window, busy, free: window - busy };
  });
  const unassigned = Object.values(resp).filter((ids) => ids.length === 0).length;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Regionen · Auslastung der Woche</h2>
      <div className="card mt-3 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">Einsatztage</th>
              <th className="px-4 py-3 font-medium">Eingeplant</th>
              <th className="px-4 py-3 font-medium">Offen</th>
              <th className="w-64 px-4 py-3 font-medium">Auslastung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const ratio = r.window ? r.busy / r.window : 0;
              const bar = ratio > 0.95 ? 'bg-red-500' : ratio > 0.8 ? 'bg-amber-500' : 'bg-brand-500';
              return (
                <tr key={r.t.id} className="transition hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/planer?region=${r.t.id}`} className="flex items-center gap-2 font-medium hover:text-brand-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: technicianColor(r.t.id, techIds) }} />
                      {regionLabel(r.t)}
                      <span className="font-normal text-gray-400">· {r.t.home.label}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{r.days || <span className="text-amber-600">keine</span>}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.planned} / {r.responsible}
                  </td>
                  <td className={`px-4 py-3 ${r.open ? 'font-medium text-amber-600' : 'text-gray-400'}`}>{r.open}</td>
                  <td className="px-4 py-3">
                    {r.window ? (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                        <span className="w-24 text-right text-xs text-gray-500">{formatMinutes(Math.max(0, r.free))} frei</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">nicht verfügbar</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {unassigned > 0 && (
              <tr className="bg-gray-50/60">
                <td className="px-4 py-3">
                  <Link to={`/stammdaten/anfragen?region=${NO_REGION}`} className="font-medium text-gray-600 hover:text-brand-600">
                    Ohne Zuständigkeit
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-400">–</td>
                <td className="px-4 py-3 text-gray-400">–</td>
                <td className="px-4 py-3 font-medium text-red-600">{unassigned}</td>
                <td className="px-4 py-3 text-xs text-gray-500">kein Gebiet & &gt; 15 km vom Wohnort</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
