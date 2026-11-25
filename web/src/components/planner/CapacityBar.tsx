import { formatMinutes } from '@/lib/format';
import type { DayRoute } from '@/lib/types';

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Auslastung eines Techniker-Tages: Arbeit vor Ort · Fahrt · Rest (Pause/Warten) · frei */
export function dayCapacity(route: DayRoute) {
  const window = toMin(route.window.end) - toMin(route.window.start);
  const busy = route.stops.length ? toMin(route.returnHome) - toMin(route.departure) : 0;
  const work = route.workMinutes;
  const drive = route.driveMinutes;
  const other = Math.max(0, busy - work - drive);
  const free = Math.max(0, window - busy);
  const overtime = Math.max(0, toMin(route.returnHome) - toMin(route.window.end));
  return { window, busy, work, drive, other, free, overtime, ratio: window ? busy / window : 0 };
}

export default function CapacityBar({ route }: { route: DayRoute }) {
  const c = dayCapacity(route);
  const pct = (v: number) => `${Math.min(100, (v / Math.max(c.window, c.busy)) * 100)}%`;
  // Heimfahrt darf laut Case bis 60 min über das Fenster – erst darüber ist es ein Regelverstoß
  const label =
    c.overtime > 60 ? `Heimfahrt +${c.overtime} min – über Limit` : c.overtime > 0 ? `voll · Heimfahrt +${c.overtime} min (erlaubt)` : c.free < 30 ? 'voll' : `${formatMinutes(c.free)} frei`;
  const tone = c.overtime > 60 ? 'text-red-600' : c.free < 60 || c.overtime > 0 ? 'text-amber-600' : 'text-brand-700';
  return (
    <span className="mt-1.5 block" title={`Vor Ort ${formatMinutes(c.work)} · Fahrt ${formatMinutes(c.drive)} · Pause/Warten ${formatMinutes(c.other)} · frei ${formatMinutes(c.free)}`}>
      <span className="flex h-1.5 overflow-hidden rounded-full bg-gray-100">
        <span className="block bg-brand-500" style={{ width: pct(c.work) }} />
        <span className="block bg-gray-400" style={{ width: pct(c.drive) }} />
        <span className="block bg-gray-300" style={{ width: pct(c.other) }} />
      </span>
      <span className={`mt-1 block text-[11px] font-medium ${tone}`}>{label}</span>
    </span>
  );
}
