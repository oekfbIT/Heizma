/**
 * @file      RegionOverview.tsx – Auslastung je Einsatzgebiet über die Woche (Zahlen addieren sich zur Gesamtzahl)
 * @layer     Web · View-Komponente
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { Link } from 'react-router-dom';
import { dayCapacity } from '@/components/planner/CapacityBar';
import type { Stammdaten } from '@/modules';
import { useCore, useResource } from '@/core';
import { Card } from '@/ui';
import { formatMinutes } from '@/lib/format';
import { regionLabel } from '@/lib/regions';
import type { Plan } from '@/lib/types';

/**
 * Auslastung je Person über die Planungswoche. Gezählt wird, wo eine Anfrage tatsächlich eingeplant ist
 * (bzw. vorgeplant), nicht in welchen Gebieten sie liegt – Gebiete überlappen, so würde doppelt gezählt.
 * Darum ergeben die Spalten zusammen mit „Nicht planbar“ genau die Gesamtzahl.
 */
export default function RegionOverview({ data, plan }: { data: Stammdaten; plan: Plan }) {
  const core = useCore();
  const placements = useResource(core.system.forecast).data?.placements ?? {};
  const b = core.balance(plan);
  const colors = core.techniker.colors(data.technicians);
  const rows = data.technicians.map((t) => {
    const routes = plan.routes.filter((r) => r.technicianId === t.id);
    const planned = routes.reduce((n, r) => n + r.stops.filter((s) => s.kind === 'request').length, 0);
    const later = plan.unassigned.filter((u) => placements[u.requestId]?.technicianId === t.id && u.reason.startsWith('Kapazität')).length;
    const cap = routes.map(dayCapacity);
    const window = cap.reduce((n, c) => n + c.window, 0);
    const busy = cap.reduce((n, c) => n + c.busy, 0);
    return { t, planned, later, days: routes.length, window, busy, free: Math.max(0, window - busy) };
  });
  const sum = { planned: rows.reduce((n, r) => n + r.planned, 0), later: rows.reduce((n, r) => n + r.later, 0) };
  const th = 'px-4 py-3 font-medium';
  const sub = 'block text-[10px] font-normal normal-case tracking-normal text-gray-400';

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Auslastung je Einsatzgebiet · {core.system.periodLabel(data.range)}</h2>
      <p className="mt-1 text-xs text-gray-500">
        Gezählt wird bei der Person, bei der eine Anfrage eingeplant ist. Gebiete überlappen – eine Anfrage zählt trotzdem nur einmal. Ein Klick öffnet die Routenplanung für diese
        Person.
      </p>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className={th}>Einsatzgebiet<span className={sub}>Person · Wohnort</span></th>
              <th className={`hidden sm:table-cell ${th}`}>Arbeitstage<span className={sub}>diese Woche</span></th>
              <th className={`${th} text-right`}>Diese Woche<span className={sub}>eingeplant</span></th>
              <th className={`${th} text-right`}>Folgewochen<span className={sub}>vorgeplant, vorläufig</span></th>
              <th className={`w-40 md:w-64 ${th}`}>Freie Arbeitszeit<span className={sub}>Rest dieser Woche</span></th>
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
                  <td className="hidden px-4 py-3 text-gray-600 sm:table-cell">{r.days ? `${r.days} von 5` : <span className="text-warning-600">keine</span>}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.planned}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${r.later ? 'text-gray-700' : 'text-gray-300'}`}>{r.later}</td>
                  <td className="px-4 py-3">
                    {r.window ? (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                          <div className={`h-full ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                        </div>
                        <span className="w-16 text-right text-xs text-gray-500 md:w-24">{r.free < 30 ? 'ausgebucht' : `${formatMinutes(r.free)} frei`}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-warning-600">keine Verfügbarkeit eingetragen</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-gray-200 text-sm">
            <tr className="bg-gray-50/60 font-medium">
              <td className="px-4 py-2.5">Summe eingeplant</td>
              <td className="hidden sm:table-cell" />
              <td className="px-4 py-2.5 text-right tabular-nums">{sum.planned}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{sum.later}</td>
              <td className="px-4 py-2.5 text-xs font-normal text-gray-500">{sum.planned + sum.later} Anfragen</td>
            </tr>
            {b.waitlist > 0 && <Rest label="Warteliste" hint="auch in den Folgewochen kein Platz" count={b.waitlist} to="/stammdaten/anfragen?filter=waitlist" />}
            {b.unplannable > 0 && (
              <Rest
                label="Nicht planbar"
                hint={b.unplannableByReason.map((r) => `${r.count} ${r.reason}`).join(' · ')}
                count={b.unplannable}
                to="/stammdaten/anfragen?filter=unplannable"
                danger
              />
            )}
            {b.excluded > 0 && <Rest label="Aus dem Plan genommen" hint="vom Planer zurückgestellt" count={b.excluded} to="/stammdaten/anfragen?filter=excluded" />}
            <tr className="font-semibold">
              <td className="px-4 py-2.5">Anfragen gesamt</td>
              <td className="hidden sm:table-cell" />
              <td colSpan={2} className="px-4 py-2.5 text-right tabular-nums">{b.total}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </Card>
    </section>
  );
}

function Rest({ label, hint, count, to, danger }: { label: string; hint: string; count: number; to: string; danger?: boolean }) {
  return (
    <tr>
      <td className="px-4 py-2.5" colSpan={2}>
        <Link to={to} className="font-medium text-gray-700 hover:text-brand-600">
          {label} →
        </Link>
        <span className="block text-xs text-gray-500">{hint}</span>
      </td>
      <td colSpan={2} className={`px-4 py-2.5 text-right tabular-nums font-medium ${danger ? 'text-danger-600' : 'text-gray-700'}`}>
        {count}
      </td>
      <td />
    </tr>
  );
}
