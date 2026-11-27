/**
 * @file      PlanKpis.tsx – Ersparnis gegenüber Handplanung: eingesparte Fahrzeit als Kennzahl + zwei Balken
 * @layer     Web · View-Komponente (Planer)
 * @siehe     docs/03-planung-und-regeln.md · api/src/planner.ts baselinePlan()
 */
import { formatMinutes } from '@/lib/format';
import type { Plan } from '@/lib/types';

const METHOD =
  'Handplanung = derselbe Datenstand, von Hand verteilt: älteste Anfrage zuerst, an die nächstgelegene zuständige Person, ' +
  'hinten an den ersten Tag, an dem sie passt. Gleiche Regeln und Fahrzeiten wie der Planer.';

/** Was bringt die Optimierung? Eingesparte Fahrzeit diese Woche – Optimiert vs. Handplanung auf denselben Daten. */
export default function PlanKpis({ plan }: { plan: Plan }) {
  const s = plan.stats;
  const base = s.baseline;
  const saved = Math.max(0, base.driveMinutes - s.driveMinutes);
  const pct = base.driveMinutes ? Math.round((saved / base.driveMinutes) * 100) : 0;
  const max = Math.max(base.driveMinutes, s.driveMinutes, 1);
  const perVisit = (drive: number, visits: number) => (visits ? Math.round(drive / visits) : 0);
  const moreVisits = s.planned - base.planned;
  const t = plan.travel;
  const source = !t || t.source === 'estimate' ? 'Fahrzeiten geschätzt (Luftlinie)' : 'Fahrzeiten: Heizma /travel';

  return (
    <section className="mt-3 rounded-xl border border-gray-200 bg-white p-3" title={`${METHOD} ${source}.`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium text-gray-500">Fahrzeit gespart gegenüber Handplanung</p>
        {pct > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-brand-700">−{pct} %</span>}
      </div>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight text-ink">{saved > 0 ? formatMinutes(saved) : '—'}</p>

      <div className="mt-2.5 space-y-1.5">
        <Bar label="Optimiert" minutes={s.driveMinutes} max={max} className="bg-brand-500" strong />
        <Bar label="Von Hand" minutes={base.driveMinutes} max={max} className="bg-gray-300" />
      </div>

      <p className="mt-2.5 text-xs tabular-nums text-gray-500">
        {s.planned} Besuche{moreVisits > 0 && <span className="font-medium text-brand-700"> (+{moreVisits})</span>} · Ø {perVisit(s.driveMinutes, s.planned)} statt{' '}
        {perVisit(base.driveMinutes, base.planned)} min Anfahrt
      </p>
    </section>
  );
}

function Bar({ label, minutes, max, className, strong }: { label: string; minutes: number; max: number; className: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center gap-2 text-xs">
      <span className={strong ? 'font-medium text-ink' : 'text-gray-500'}>{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-gray-100">
        <span className={`block h-full rounded-full ${className}`} style={{ width: `${(minutes / max) * 100}%` }} />
      </span>
      <span className={`text-right tabular-nums ${strong ? 'font-medium text-ink' : 'text-gray-500'}`}>{formatMinutes(minutes)}</span>
    </div>
  );
}
