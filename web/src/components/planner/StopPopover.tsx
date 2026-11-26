import { formatMinutes, visitationLabel } from '@/lib/format';
import type { PlannedStop } from '@/lib/types';

/** Inhalt des Karten-Popovers eines ausgewählten Stopps – bleibt offen, solange er ausgewählt ist */
export default function StopPopover({ stop, index, color, onDetails, onClose }: { stop: PlannedStop; index: number; color: string; onDetails: () => void; onClose: () => void }) {
  return (
    <div className="w-[240px] text-left font-sans text-xs leading-snug text-ink" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ background: stop.fixed ? 'rgb(var(--color-ink))' : color }}>
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{stop.customer}</p>
          <p className="text-gray-500">{stop.address}</p>
        </div>
        <button onClick={onClose} className="-mr-1 -mt-1 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Schließen">
          ✕
        </button>
      </div>
      {/* Was ist das für ein Termin? (Daten aus der API) */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${stop.appointmentType === 'Inbetriebnahme' ? 'bg-ink text-white' : 'bg-brand-50 text-brand-700'}`}>
          {stop.appointmentType}
        </span>
        {(stop.appointmentType === 'Besichtigung' || stop.visitationType) && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-700">
            {visitationLabel(stop.visitationType)}
            {stop.visitationType && <span className="text-gray-400"> · {stop.visitationType}</span>}
          </span>
        )}
        {stop.fixed && <span className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">fix</span>}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-gray-500">Termin</span>
        <span className="font-semibold tabular-nums">
          {stop.start}–{stop.end}
        </span>
        <span className="text-gray-500">Dauer vor Ort</span>
        <span>
          {formatMinutes(stop.durationMinutes)}
          {!stop.visitationType && stop.appointmentType === 'Besichtigung' && <span className="text-gray-400"> (angenommen)</span>}
        </span>
        <span className="text-gray-500">Ankunft</span>
        <span className="tabular-nums">
          {stop.arrival} · {stop.travelEstimated ? '≈' : ''}
          {stop.travelMinutes} min Fahrt
        </span>
        {stop.waitMinutes > 0 && (
          <>
            <span className="text-gray-500">Wartezeit</span>
            <span className="text-warning-600">{stop.waitMinutes} min</span>
          </>
        )}
      </div>
      <button onClick={onDetails} className="mt-3 w-full rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-600">
        Alle Details anzeigen
      </button>
    </div>
  );
}
