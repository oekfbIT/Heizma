/**
 * @file      PlanKpis.tsx – Ersparnis gegenüber Handplanung (Fahrzeit, Besuche, Ø Anfahrt) + Fahrzeitquelle
 * @layer     Web · View-Komponente (Planer)
 * @siehe     docs/03-planung-und-regeln.md · api/src/planner.ts baselinePlan()
 */
import { formatMinutes } from '@/lib/format';
import type { Plan } from '@/lib/types';

/**
 * Was bringt die Optimierung? Vergleich mit einer Handplanung auf denselben Daten, Regeln und Fahrzeiten:
 * älteste Anfrage zuerst → zuständige Person mit dem nächsten Wohnort → hinten an den ersten Tag, an dem sie passt.
 */
export default function PlanKpis({ plan }: { plan: Plan }) {
  const s = plan.stats;
  const base = s.baseline;
  const saved = base.driveMinutes - s.driveMinutes;
  const pct = base.driveMinutes ? Math.round((saved / base.driveMinutes) * 100) : 0;
  const perVisit = (drive: number, visits: number) => (visits ? Math.round(drive / visits) : 0);
  const moreVisits = s.planned - base.planned;
  const t = plan.travel;
  const travelLabel =
    !t || t.source === 'estimate'
      ? 'Fahrzeiten geschätzt (Luftlinie)'
      : t.source === 'heizma'
        ? 'Fahrzeiten: Heizma /travel'
        : `Fahrzeiten: ${Math.round((t.pairsReal / t.pairsNeeded) * 100)} % Heizma /travel`;

  return (
    <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Gegenüber Handplanung</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-ink">
        {saved > 0 ? `${formatMinutes(saved)} weniger Fahrzeit` : 'Gleiche Fahrzeit'}
        {saved > 0 && <span className="ml-1 text-sm font-medium text-brand-700">(−{pct} %)</span>}
        {moreVisits > 0 && <span className="ml-1 text-sm font-medium text-brand-700">· +{moreVisits} Besuche</span>}
      </p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
        <Compare label="Fahrzeit" value={formatMinutes(s.driveMinutes)} before={formatMinutes(base.driveMinutes)} />
        <Compare label="Besuche" value={String(s.planned)} before={String(base.planned)} />
        <Compare label="Ø Anfahrt" value={`${perVisit(s.driveMinutes, s.planned)} min`} before={`${perVisit(base.driveMinutes, base.planned)} min`} />
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">
        Handplanung: älteste zuerst, nächste zuständige Person, hinten an den ersten freien Tag – gleiche Regeln und Fahrzeiten. · 🚗 {travelLabel}
      </p>
    </div>
  );
}

function Compare({ label, value, before }: { label: string; value: string; before: string }) {
  return (
    <div className="rounded-lg bg-white px-1.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      <p className="text-[10px] tabular-nums text-gray-400 line-through decoration-gray-300">{before}</p>
    </div>
  );
}
