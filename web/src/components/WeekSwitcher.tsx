/**
 * @file      WeekSwitcher.tsx – Wochen-Umschalter: echte Woche vs. Prognose-Wochen
 * @layer     Web · View-Komponente
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { formatDay, isoWeek } from '@/lib/format';
import type { Forecast } from '@/modules';
import { Icon } from '@/ui';

/**
 * Wochen-Umschalter: Diese Woche ist echt geplant, Folgewochen sind vorgeplant (vorläufig)
 * (Verfügbarkeit wie diese Woche angenommen). Bewusst klein – die echte Arbeit passiert in dieser Woche.
 */
export default function WeekSwitcher({ weeks, value, onChange, className = '' }: { weeks: Forecast['weeks']; value: number; onChange: (w: number) => void; className?: string }) {
  const w = weeks[value] ?? weeks[0];
  if (!w) return null;
  const last = weeks.length - 1;
  const arrow = 'flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent';
  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5 text-xs ${className}`}>
      <button className={arrow} disabled={value <= 0} onClick={() => onChange(value - 1)} aria-label="Vorherige Woche">
        <Icon name="back" className="h-3.5 w-3.5" />
      </button>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="cursor-pointer appearance-none bg-transparent px-1 text-center font-medium text-gray-700 focus:outline-none"
        aria-label="Woche wählen"
      >
        {weeks.map((x) => (
          <option key={x.index} value={x.index}>
            KW {isoWeek(x.from)} · {x.index === 0 ? 'diese Woche' : 'vorgeplant'} · {formatDay(x.from)}–{formatDay(x.to)}
          </option>
        ))}
      </select>
      {value > 0 && <span className="rounded bg-info-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-info-700">Vorläufig</span>}
      <button className={arrow} disabled={value >= last} onClick={() => onChange(value + 1)} aria-label="Nächste Woche">
        <Icon name="back" className="h-3.5 w-3.5 rotate-180" />
      </button>
      {w && null}
    </div>
  );
}
