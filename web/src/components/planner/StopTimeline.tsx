import Icon from '@/components/ui/Icon';
import { formatMinutes } from '@/lib/format';
import type { DayRoute, Technician } from '@/lib/types';

interface Props {
  route: DayRoute;
  technician: Technician;
  color: string;
  checked: Set<string>;
  hoveredStopId: string | null;
  onToggle: (stopId: string) => void;
  onHover: (stopId: string | null) => void;
  approved: boolean;
  onApprove: () => void;
}

const TYPE_STYLE: Record<string, string> = {
  WP: 'bg-orange-50 text-orange-700',
  PV: 'bg-yellow-50 text-yellow-700',
  'WP+PV': 'bg-brand-50 text-brand-700',
};

/** Tagesablauf einer Route: Abfahrt → Stopps (mit Pause) → Heimfahrt */
export default function StopTimeline({ route, technician, color, checked, hoveredStopId, onToggle, onHover, approved, onApprove }: Props) {
  const lunchAfter = route.lunch ? route.stops.findIndex((s) => s.start >= route.lunch!.end) : -1;
  const allChecked = route.stops.length > 0 && route.stops.every((s) => checked.has(s.id));

  return (
    <div>
      <ol className="relative ml-3 border-l-2 border-dashed border-gray-200">
        <TimelineRow time={route.departure} icon={<Icon name="home" className="h-3.5 w-3.5" />} color={color} title="Abfahrt Wohnort" subtitle={technician.home.label} />

        {route.stops.map((stop, idx) => (
          <div key={stop.id}>
            {lunchAfter === idx && route.lunch && (
              <TimelineRow time={route.lunch.start} icon={<Icon name="coffee" className="h-3.5 w-3.5" />} color="#9ca3af" title="Mittagspause" subtitle={`${route.lunch.start}–${route.lunch.end}`} muted />
            )}
            <li
              onMouseEnter={() => onHover(stop.id)}
              onMouseLeave={() => onHover(null)}
              className={`relative -ml-[13px] mb-1 flex gap-3 rounded-lg py-2 pl-0 pr-2 transition ${hoveredStopId === stop.id ? 'bg-gray-50' : ''}`}
            >
              <span
                className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow"
                style={{ background: stop.fixed ? '#20242d' : color }}
              >
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{stop.customer}</p>
                  <p className="shrink-0 text-xs font-medium tabular-nums text-gray-700">
                    {stop.start}–{stop.end}
                  </p>
                </div>
                <p className="truncate text-xs text-gray-500">{stop.address}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  {stop.visitationType && (
                    <span className={`rounded px-1.5 py-0.5 font-medium ${TYPE_STYLE[stop.visitationType] ?? 'bg-gray-100 text-gray-600'}`}>{stop.visitationType}</span>
                  )}
                  {stop.fixed && (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-900 px-1.5 py-0.5 font-medium text-white">
                      <Icon name="lock" className="h-3 w-3" /> fix
                    </span>
                  )}
                  <span className="text-gray-500">🚗 {stop.travelMinutes} min · Ankunft {stop.arrival}</span>
                  {stop.waitMinutes > 0 && <span className="text-amber-600">⏳ {stop.waitMinutes} min warten</span>}
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-start pt-0.5" title="Stopp bestätigen">
                <input type="checkbox" checked={checked.has(stop.id)} onChange={() => onToggle(stop.id)} className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
              </label>
            </li>
          </div>
        ))}

        <TimelineRow time={route.returnHome} icon={<Icon name="home" className="h-3.5 w-3.5" />} color={color} title="Ankunft Wohnort" subtitle={`Fahrzeit gesamt ${formatMinutes(route.driveMinutes)} · vor Ort ${formatMinutes(route.workMinutes)}`} />
      </ol>

      <button onClick={onApprove} className={`${approved ? 'btn-secondary' : 'btn-primary'} mt-4 w-full`} disabled={!route.stops.length}>
        {approved ? 'Freigabe zurücknehmen' : allChecked ? 'Route freigeben' : 'Route freigeben (alle Stopps bestätigen)'}
      </button>
    </div>
  );
}

function TimelineRow({ time, icon, color, title, subtitle, muted }: { time: string; icon: React.ReactNode; color: string; title: string; subtitle: string; muted?: boolean }) {
  return (
    <li className="relative -ml-[13px] mb-1 flex gap-3 py-2">
      <span className="z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 bg-white" style={{ borderColor: color, color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`text-sm font-medium ${muted ? 'text-gray-500' : ''}`}>{title}</p>
          <p className="text-xs font-medium tabular-nums text-gray-700">{time}</p>
        </div>
        <p className="truncate text-xs text-gray-500">{subtitle}</p>
      </div>
    </li>
  );
}
