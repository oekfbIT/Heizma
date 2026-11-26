/**
 * @file      TechnicianCell.tsx – Zeile einer Person in der Tagesliste (Termine, Fahrt, Status)
 * @layer     Web · View-Komponente (Planer)
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { formatMinutes } from '@/lib/format';
import CapacityBar from './CapacityBar';
import type { DayRoute, Technician } from '@/lib/types';

interface Props {
  technician: Technician;
  route: DayRoute | undefined;
  status: 'available' | 'blocked' | 'none';
  color: string;
  selected: boolean;
  approved: boolean;
  hasViolation?: boolean;
  onClick: () => void;
}

/** Eine Person in der Liste: wer, wie viele Termine, wie viel Fahrt – und ein klarer Status rechts */
export default function TechnicianCell({ technician, route, status, color, selected, approved, hasViolation, onClick }: Props) {
  const stops = route?.stops.length ?? 0;
  const disabled = status !== 'available';
  const pill = disabled
    ? { label: status === 'blocked' ? 'Abwesend' : 'Nicht verfügbar', cls: 'bg-gray-100 text-gray-500' }
    : hasViolation
      ? { label: 'Prüfen', cls: 'bg-danger-100 text-danger-700' }
      : approved
        ? { label: '✓ Freigegeben', cls: 'bg-brand-500 text-white' }
        : stops
          ? { label: 'Offen', cls: 'bg-warning-100 text-warning-800' }
          : { label: 'Keine Termine', cls: 'bg-gray-100 text-gray-500' };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
        selected ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: disabled ? 'rgb(var(--color-gray-400))' : color }}>
        {technician.name.replace(/^Techniker(in)?\s*/i, '').slice(0, 2).toUpperCase() || stops}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold">{technician.name}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pill.cls}`}>{pill.label}</span>
        </span>
        {!disabled && route && stops > 0 ? (
          <>
            <span className="block text-xs text-gray-600">
              {stops} {stops === 1 ? 'Termin' : 'Termine'} · {formatMinutes(route.driveMinutes)} Fahrt · {route.departure}–{route.returnHome}
            </span>
            <CapacityBar route={route} />
          </>
        ) : (
          <span className="block truncate text-xs text-gray-500">{technician.home.label}</span>
        )}
      </span>
    </button>
  );
}
