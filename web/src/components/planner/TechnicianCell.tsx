import { formatMinutes } from '@/lib/format';
import type { DayRoute, Technician } from '@/lib/types';

interface Props {
  technician: Technician;
  route: DayRoute | undefined;
  status: 'available' | 'blocked' | 'none';
  color: string;
  selected: boolean;
  approved: boolean;
  onClick: () => void;
}

/** Zeile in der Sidebar: ein Techniker mit Kennzahlen seiner Tagesroute */
export default function TechnicianCell({ technician, route, status, color, selected, approved, onClick }: Props) {
  const requests = route?.stops.filter((s) => s.kind === 'request').length ?? 0;
  const fixed = route?.stops.filter((s) => s.fixed).length ?? 0;
  const disabled = status !== 'available';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        selected ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-gray-200 bg-white hover:border-gray-300'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: disabled ? '#9ca3af' : color }}>
        {route?.stops.length ?? 0}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{technician.name}</span>
          {approved && <span className="rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">FREIGEGEBEN</span>}
        </span>
        <span className="block truncate text-xs text-gray-500">{technician.home.label}</span>
        {status === 'available' && route ? (
          <span className="mt-1 flex flex-wrap gap-x-3 text-xs text-gray-600">
            <span>{requests} neu</span>
            {fixed > 0 && <span>{fixed} fix</span>}
            <span>🚗 {formatMinutes(route.driveMinutes)}</span>
            <span>
              {route.window.start}–{route.window.end}
            </span>
          </span>
        ) : (
          <span className="mt-1 block text-xs font-medium text-amber-600">
            {status === 'blocked' ? 'Gesperrt (Urlaub/Krank)' : 'Keine Verfügbarkeit'}
          </span>
        )}
      </span>
    </button>
  );
}
