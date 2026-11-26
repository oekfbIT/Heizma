/**
 * @file      PlanKpis.tsx – Kennzahlen zur Planqualität (Fahrzeit, Ersparnis durch Optimierung, Freigaben)
 * @layer     Web · View-Komponente (Planer)
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 */
import { formatMinutes } from '@/lib/format';
import type { Plan } from '@/lib/types';

/** Kennzahlen zur Planqualität: Fahrzeit (inkl. Ersparnis durch Optimierung), Ø pro Besuch, Freigaben */
export default function PlanKpis({ plan }: { plan: Plan }) {
  const s = plan.stats;
  const saved = s.greedyDriveMinutes - s.driveMinutes;
  const pct = s.greedyDriveMinutes ? Math.round((saved / s.greedyDriveMinutes) * 100) : 0;
  const t = plan.travel;
  const travelLabel =
    !t || t.source === 'estimate'
      ? 'Fahrzeiten geschätzt (Luftlinie)'
      : t.source === 'heizma'
        ? 'Fahrzeiten: Heizma /travel'
        : `Fahrzeiten: ${Math.round((t.pairsReal / t.pairsNeeded) * 100)} % Heizma /travel`;

  return (
    <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
      <Kpi label="Eingeplant" value={`${s.planned}/${s.totalRequests}`} />
      <Kpi label="Fahrzeit" value={formatMinutes(s.driveMinutes)} sub={saved > 0 ? `−${pct} % optimiert` : undefined} title={`Greedy: ${formatMinutes(s.greedyDriveMinutes)} → nach 2-opt/Relocate: ${formatMinutes(s.driveMinutes)} (${s.improvements} Verbesserungen)`} />
      <Kpi label="Ø Anfahrt" value={`${s.avgDrivePerVisit} min`} />
      <Kpi label="Freigegeben" value={`${s.approvedRoutes}/${s.routesWithStops}`} />
      {!!s.prioritySwaps && (
        <p className="col-span-4 text-left text-[11px] text-gray-500" title="Nach der Optimierung hätte eine jüngere Anfrage den Platz einer wartenden älteren belegt – getauscht.">
          ⇅ {s.prioritySwaps} Tausch{s.prioritySwaps === 1 ? '' : 'e'} für „ältere zuerst“
        </p>
      )}
      <p className={`col-span-4 text-left text-[11px] ${t && t.source !== 'estimate' ? 'text-gray-500' : 'text-warning-600'}`} title={t ? `${t.pairsReal} echte / ${t.pairsEstimated} geschätzte Fahrzeitpaare` : undefined}>
        🚗 {travelLabel}
      </p>
    </div>
  );
}

function Kpi({ label, value, sub, title }: { label: string; value: string; sub?: string; title?: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-1.5 py-1.5" title={title}>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] font-medium text-brand-600">{sub}</p>}
    </div>
  );
}
