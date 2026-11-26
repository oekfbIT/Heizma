/**
 * @file      ForecastCard.tsx – Prognose-Streifen: Wochen bis die Warteliste leer ist
 * @layer     Web · View-Komponente
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { Link } from 'react-router-dom';
import { useCore, useResource } from '@/core';
import { formatDay, isoWeek } from '@/lib/format';
import { Icon } from '@/ui';

/**
 * Dezente Prognose unter dem Seitentitel: Wie lange dauert es, alle offenen Anfragen abzuarbeiten?
 * Ein Balken pro Woche (anteilig nach Anfragen), jede Woche öffnet die Routenplanung dieser Woche.
 */
export default function ForecastStrip() {
  const core = useCore();
  const { data: f } = useResource(core.system.forecast);
  if (!f) return null;
  const total = f.weeks.reduce((n, w) => n + w.planned, 0) || 1;
  const pending = f.needsAction.review + f.needsAction.dataErrors + f.needsAction.excluded;
  const headline =
    f.weeks.length === 1 && f.weeks[0].remaining === 0 ? (
      <>Alles passt in <strong className="text-ink">diese Woche</strong></>
    ) : f.weeksNeeded ? (
      <>Alle offenen Anfragen bis <strong className="text-ink">KW {isoWeek(f.weeks[f.weeks.length - 1].from)}</strong> vorgeplant</>
    ) : (
      <><strong className="text-ink">{f.stuck}</strong> Anfragen kommen auch später nicht unter</>
    );

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 items-center gap-2.5 sm:w-64 sm:shrink-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name="calendar" className="h-4 w-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            Vorplanung{' '}
            <span className="cursor-help font-normal normal-case tracking-normal text-gray-400" title={`Annahmen:\n• ${f.assumptions.join('\n• ')}`}>
              ⓘ
            </span>
          </p>
          <p className="text-sm text-gray-600">{headline}</p>
        </div>
      </div>

      {/* Ein Segment pro Woche, Breite = Anteil der Anfragen */}
      <div className="flex min-w-0 flex-1 gap-1">
        {f.weeks.map((w) => (
          <Link
            key={w.index}
            to={`/planer${w.index ? `?week=${w.index}` : ''}`}
            title={`${formatDay(w.from)}–${formatDay(w.to)} · ${w.planned} eingeplant${w.remaining ? ` · danach ${w.remaining} offen` : ''}${w.index ? ' (vorläufig)' : ''}`}
            className="group min-w-[64px]"
            style={{ flex: `${Math.max(w.planned, total * 0.12)} 1 0` }}
          >
            <div className={`h-1.5 rounded-full transition group-hover:opacity-80 ${w.index === 0 ? 'bg-brand-500' : 'bg-brand-200'}`} />
            <p className="mt-1.5 flex items-baseline justify-between gap-1 text-xs">
              <span className={w.index === 0 ? 'font-semibold text-gray-800' : 'text-gray-500'}>KW {isoWeek(w.from)}</span>
              <span className="tabular-nums text-gray-500 group-hover:text-brand-700">{w.planned}</span>
            </p>
          </Link>
        ))}
      </div>

      {pending > 0 && (
        <Link
          to={`/stammdaten/anfragen?filter=${f.needsAction.review ? "review" : "unplannable"}`}
          className="shrink-0 rounded-lg px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          title="Offener Zeitwunsch, Datenfehler oder aus dem Plan genommen – nicht vorgeplant"
        >
          + {pending} warten auf Entscheidung →
        </Link>
      )}
    </div>
  );
}
