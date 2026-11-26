import Icon from '@/components/ui/Icon';
import type { NoteInfo } from '@/lib/api';
import { formatMinutes } from '@/lib/format';
import type { DayRoute, Technician } from '@/lib/types';

interface Props {
  route: DayRoute;
  technician: Technician;
  color: string;
  selectedStopId: string | null;
  hoveredStopId: string | null;
  onSelectStop: (stopId: string) => void;
  onHover: (stopId: string | null) => void;
  /** Stopp-IDs mit Regelverstoß (aus der Plan-Prüfung) */
  violations?: Map<string, string[]>;
  /** Anfragen mit bewusster Ausnahme des Planers (gelb) */
  exceptions?: Set<string>;
  notes?: NoteInfo;
}

/** Tagesablauf als einfache Liste: links die Uhrzeit, rechts wer/wo. Klick = auf der Karte zeigen. */
export default function StopTimeline({ route, technician, color, selectedStopId, hoveredStopId, onSelectStop, onHover, violations, exceptions, notes }: Props) {
  const lunchBefore = route.lunch ? route.stops.findIndex((s) => s.start >= route.lunch!.end) : -1;

  return (
    <ol className="space-y-1">
      <Fixed time={route.departure} icon="home" title="Abfahrt" subtitle={technician.home.label} />

      {route.stops.map((stop, idx) => {
        const insight = notes?.insights.find((i) => i.requestId === stop.id);
        const bad = violations?.get(stop.id);
        const selected = selectedStopId === stop.id;
        return (
          <li key={stop.id}>
            {lunchBefore === idx && route.lunch && <Fixed time={route.lunch.start} icon="coffee" title="Mittagspause" subtitle={`${route.lunch.start}–${route.lunch.end}`} muted />}
            {/* Fahrt dorthin */}
            <p className="ml-[58px] py-0.5 text-[11px] text-gray-400">
              ↓ {stop.travelEstimated ? 'ca. ' : ''}
              {stop.travelMinutes} min Fahrt{stop.waitMinutes > 0 && <span className="text-amber-600"> · {stop.waitMinutes} min warten</span>}
            </p>
            <button
              ref={selected ? (el) => el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) : undefined}
              onClick={() => onSelectStop(stop.id)}
              onMouseEnter={() => onHover(stop.id)}
              onMouseLeave={() => onHover(null)}
              className={`flex w-full gap-3 rounded-xl border px-2 py-2 text-left transition ${
                bad ? 'border-red-200 bg-red-50' : exceptions?.has(stop.id) ? 'border-amber-200 bg-amber-50' : selected ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : hoveredStopId === stop.id ? 'border-gray-200 bg-gray-50' : 'border-transparent'
              }`}
            >
              <span className="w-[46px] shrink-0 pt-0.5 text-right text-xs font-semibold tabular-nums text-gray-700">
                {stop.start}
                <span className="block font-normal text-gray-400">{stop.end}</span>
              </span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white" style={{ background: stop.fixed ? '#20242d' : color }}>
                {idx + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-semibold">{stop.customer}</span>
                  {stop.fixed && <Icon name="lock" className="h-3 w-3 shrink-0 text-gray-500" />}
                </span>
                <span className="block truncate text-xs text-gray-500">{stop.address}</span>
                <span className="mt-0.5 flex flex-wrap gap-1 text-[11px]">
                  <Tag className={stop.appointmentType === 'Inbetriebnahme' ? 'bg-gray-900 text-white' : 'bg-brand-50 text-brand-700'}>{stop.appointmentType}</Tag>
                  {(stop.appointmentType === 'Besichtigung' || stop.visitationType) && <Tag className="bg-gray-100 text-gray-600">{stop.visitationType ?? 'Typ ?'}</Tag>}
                  {stop.fixed && <Tag className="border border-gray-300 text-gray-600">fix</Tag>}
                  {stop.manual?.mode === 'pin' && <Tag className="bg-sky-100 text-sky-800">📌 manuell</Tag>}
                  {stop.manual?.mode === 'prioritize' && <Tag className="bg-violet-100 text-violet-800">⇡ vorgezogen</Tag>}
                  {exceptions?.has(stop.id) && <Tag className="bg-amber-100 text-amber-800" >Ausnahme</Tag>}
                  {insight && <Tag className="bg-violet-50 text-violet-700">{insight.hint}</Tag>}
                </span>
                {bad?.map((m) => (
                  <span key={m} className="mt-1 block text-[11px] font-medium text-red-600">
                    ⚠ {m}
                  </span>
                ))}
              </span>
              <span className="self-center text-gray-300">›</span>
            </button>
          </li>
        );
      })}

      <p className="ml-[58px] py-0.5 text-[11px] text-gray-400">↓ Heimfahrt</p>
      <Fixed time={route.returnHome} icon="home" title="Zurück zuhause" subtitle={`${formatMinutes(route.driveMinutes)} Fahrt · ${formatMinutes(route.workMinutes)} beim Kunden`} />
    </ol>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded px-1.5 py-0.5 font-medium ${className}`}>{children}</span>;
}

function Fixed({ time, icon, title, subtitle, muted }: { time: string; icon: string; title: string; subtitle: string; muted?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-2 py-1.5">
      <span className="w-[46px] shrink-0 text-right text-xs font-semibold tabular-nums text-gray-500">{time}</span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-gray-200 bg-white text-gray-500">
        <Icon name={icon} className="h-3 w-3" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${muted ? 'text-gray-500' : 'font-medium'}`}>{title}</span>
        <span className="block truncate text-xs text-gray-400">{subtitle}</span>
      </span>
    </div>
  );
}
