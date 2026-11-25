import type { Stammdaten } from '@/lib/api';
import { formatDay } from '@/lib/format';

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hours = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;

/** Wochenübersicht der Verfügbarkeit einer Person – ein Tag pro Zeile */
export default function AvailabilityWeek({ data, technicianId }: { data: Stammdaten; technicianId: string }) {
  const days: string[] = [];
  for (let d = new Date(`${data.range.from}T12:00:00`); d <= new Date(`${data.range.to}T12:00:00`); d.setDate(d.getDate() + 1)) {
    if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d.toISOString().slice(0, 10));
  }
  const entries = data.availability.filter((a) => a.technicianId === technicianId);
  const available = entries.filter((a) => !a.blocked);
  const total = available.reduce((s, a) => s + toMin(a.end) - toMin(a.start), 0);

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/50 px-4 py-3 text-sm text-red-700">
        Für diese Woche ist keine Verfügbarkeit eingetragen – die Person wird nicht eingeplant.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      <div className="divide-y divide-gray-100">
        {days.map((date) => {
          const a = entries.find((e) => e.date === date);
          const free = a && !a.blocked;
          return (
            <div key={date} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${free ? 'bg-brand-500' : a ? 'bg-amber-400' : 'bg-gray-300'}`} />
              <span className="w-24 font-medium">{formatDay(date)}</span>
              {free ? (
                <>
                  <span className="tabular-nums">{a.start} – {a.end}</span>
                  <span className="ml-auto text-gray-400">{hours(toMin(a.end) - toMin(a.start))}</span>
                </>
              ) : a ? (
                <span className="text-amber-700">Abwesend</span>
              ) : (
                <span className="text-gray-400">Nicht eingeteilt</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500">
        {available.length} von {days.length} Tagen verfügbar · {hours(total)} gesamt
      </div>
    </div>
  );
}
