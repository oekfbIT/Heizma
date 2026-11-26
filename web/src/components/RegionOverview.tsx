import { Link } from 'react-router-dom';
import { dayCapacity } from '@/components/planner/CapacityBar';
import type { Stammdaten } from '@/modules';
import { useCore } from '@/core';
import { Card } from '@/ui';
import { formatMinutes } from '@/lib/format';
import { NO_REGION, regionLabel } from '@/lib/regions';
import type { Plan } from '@/lib/types';

/** Auslastung je Einsatzgebiet (= eine Person) über die Planungswoche – Klick öffnet die gefilterte Routenplanung */
export default function RegionOverview({ data, plan }: { data: Stammdaten; plan: Plan }) {
  const core = useCore();
  const colors = core.techniker.colors(data.technicians);
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
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Auslastung je Einsatzgebiet · {core.system.periodLabel(data.range)}</h2>
      <p className="mt-1 text-xs text-gray-500">Ein Klick auf ein Gebiet öffnet die Routenplanung gefiltert auf diese Person. Der Balken zeigt, wie viel der Arbeitszeit dieser Woche bereits verplant ist (vor Ort, Fahrt, Pause). Gebiete überlappen teilweise: Eine Anfrage kann in zwei Gebieten liegen und wird dann bei einer der beiden Personen eingeplant.</p>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Einsatzgebiet<span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">zuständige Person · Wohnort</span></th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Arbeitstage<span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">an denen die Person diese Woche arbeitet</span></th>
              <th className="px-4 py-3 font-medium">Anfragen im Gebiet<span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">davon bei dieser Person eingeplant</span></th>
              <th className="px-4 py-3 font-medium">Ohne Termin<span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">warten auf einen freien Platz</span></th>
              <th className="w-40 px-4 py-3 font-medium md:w-64">Freie Arbeitszeit<span className="block text-[10px] font-normal normal-case tracking-normal text-gray-400">Rest dieser Woche</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => {
              const ratio = r.window ? r.busy / r.window : 0;
              const bar = ratio > 0.95 ? 'bg-danger-500' : ratio > 0.8 ? 'bg-warning-500' : 'bg-brand-500';
              return (
                <tr key={r.t.id} className="transition hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/planer?region=${r.t.id}`} className="flex items-start gap-2 hover:text-brand-600">
                      <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[r.t.id] }} />
                      <span>
                        <span className="block font-medium">{regionLabel(r.t)}</span>
                        <span className="block text-xs text-gray-500">
                          {r.t.name} · Wohnort {r.t.home.label}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{r.days ? `${r.days} von 5 Tagen` : <span className="text-warning-600">keine</span>}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {r.responsible} <span className="text-gray-400">· {r.planned} eingeplant</span>
                  </td>
                  <td className={`px-4 py-3 ${r.open ? 'font-medium text-warning-600' : 'text-gray-400'}`}>{r.open}</td>
                  <td className="px-4 py-3">
                    {r.window ? (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                        <span className="w-16 text-right text-xs text-gray-500 md:w-24">{r.free < 30 ? 'ausgebucht' : `${formatMinutes(r.free)} noch frei`}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-warning-600">keine Verfügbarkeit eingetragen</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {unassigned > 0 && (
              <tr className="bg-gray-50/60">
                <td className="px-4 py-3">
                  <Link to={`/stammdaten/anfragen?region=${NO_REGION}`} className="font-medium text-gray-600 hover:text-brand-600">
                    Nicht zuordenbar
                  </Link>
                  <span className="block text-xs text-gray-500">in keinem Gebiet und &gt; 15 km von jedem Wohnort</span>
                </td>
                <td className="hidden px-4 py-3 text-gray-400 sm:table-cell">–</td>
                <td className="px-4 py-3 text-gray-400">–</td>
                <td className="px-4 py-3 font-medium text-danger-600">{unassigned}</td>
                <td className="px-4 py-3 text-xs text-gray-500">intern klären</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
