/**
 * @file      ForecastCard.tsx – Bilanz-Streifen: alle Anfragen auf einen Blick (diese Woche · Folgewochen · Klärung)
 * @layer     Web · View-Komponente
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { Link } from 'react-router-dom';
import { useCore, useResource } from '@/core';
import { isoWeek } from '@/lib/format';
import { Icon } from '@/ui';

/**
 * Wo stehen alle Anfragen? Ein Segment je Woche (diese Woche + vorgeplante Folgewochen), dahinter, was Klärung braucht.
 * Alle Zahlen kommen aus core.balance() – sie addieren sich exakt zur Gesamtzahl (gleiche Quelle wie Planer und Liste).
 */
export default function ForecastStrip() {
  const core = useCore();
  const { data: f } = useResource(core.system.forecast);
  const { data: plan } = useResource(core.routen.plan);
  if (!f || !plan) return null;
  const b = core.balance(plan);
  const thisWeek = f.weeks[0]?.from;
  const lastKw = b.preplannedByWeek.length ? b.preplannedByWeek[b.preplannedByWeek.length - 1].week : null;
  const open = b.waitlist + b.unplannable + b.excluded;
  const headline =
    b.waitlist > 0 ? (
      <><strong className="text-ink">{b.waitlist}</strong> finden auch in den nächsten Wochen keinen Platz</>
    ) : lastKw ? (
      <>{open ? 'Alles Planbare' : 'Alles'} bis <strong className="text-ink">KW {lastKw}</strong> verteilt</>
    ) : (
      <>{open ? 'Alles Planbare' : 'Alles'} passt in <strong className="text-ink">diese Woche</strong></>
    );
  const segments = [
    { key: 'now', label: thisWeek ? `KW ${isoWeek(thisWeek)}` : 'Diese Woche', count: b.thisWeek, to: '/planer', title: `Diese Woche eingeplant (davon ${b.approved} freigegeben)`, strong: true },
    ...b.preplannedByWeek.map((w) => ({ key: `kw${w.week}`, label: `KW ${w.week}`, count: w.count, to: `/planer?week=${f.weeks.find((x) => isoWeek(x.from) === w.week)?.index ?? 1}`, title: 'Vorgeplant (vorläufig) – diese Woche ist voll', strong: false })),
  ];
  const max = Math.max(1, ...segments.map((s) => s.count));

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 items-center gap-2.5 sm:w-64 sm:shrink-0">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Icon name="calendar" className="h-4 w-4" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {b.total} Anfragen{' '}
            <span className="cursor-help font-normal normal-case tracking-normal text-gray-400" title={`Annahmen der Vorplanung:\n• ${f.assumptions.join('\n• ')}`}>
              ⓘ
            </span>
          </p>
          <p className="text-sm text-gray-600">{headline}</p>
        </div>
      </div>

      {/* Ein Segment pro Woche – Breite nach Anzahl */}
      <div className="flex min-w-0 flex-1 gap-1">
        {segments.map((s) => (
          <Link key={s.key} to={s.to} title={s.title} className="group min-w-[64px]" style={{ flex: `${Math.max(s.count, max * 0.15)} 1 0` }}>
            <p className={`text-sm tabular-nums group-hover:text-brand-700 ${s.strong ? 'font-semibold text-ink' : 'text-gray-600'}`}>{s.count}</p>
            <div className={`mt-1 h-1.5 rounded-full transition group-hover:opacity-80 ${s.strong ? 'bg-brand-500' : 'bg-brand-200'}`} />
            <p className="mt-1 whitespace-nowrap text-[11px] text-gray-500">{s.label}</p>
          </Link>
        ))}
      </div>

      {/* Was nicht in einer Woche steht – je Topf ein Link auf die gefilterte Liste */}
      {open > 0 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 text-xs">
          {b.waitlist > 0 && <Chip to="/stammdaten/anfragen?filter=waitlist" tone="warning" label="Warteliste" count={b.waitlist} />}
          {b.unplannable > 0 && (
            <Chip
              to="/stammdaten/anfragen?filter=unplannable"
              tone="danger"
              label="Nicht planbar"
              count={b.unplannable}
              title={b.unplannableByReason.map((r) => `${r.count} × ${r.reason}`).join('\n')}
            />
          )}
          {b.excluded > 0 && <Chip to="/stammdaten/anfragen?filter=excluded" tone="neutral" label="Aus dem Plan" count={b.excluded} />}
        </div>
      )}
    </div>
  );
}

function Chip({ to, label, count, tone, title }: { to: string; label: string; count: number; tone: 'danger' | 'warning' | 'neutral'; title?: string }) {
  const cls = tone === 'danger' ? 'bg-danger-50 text-danger-700 ring-danger-200' : tone === 'warning' ? 'bg-warning-50 text-warning-800 ring-warning-200' : 'bg-gray-50 text-gray-600 ring-gray-200';
  return (
    <Link to={to} title={title} className={`rounded-full px-2.5 py-1 font-medium ring-1 transition hover:opacity-80 ${cls}`}>
      {label} <span className="tabular-nums">{count}</span> →
    </Link>
  );
}
