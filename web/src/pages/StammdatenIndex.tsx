/**
 * @file      StammdatenIndex.tsx – Seite: Stammdaten-Übersicht mit KPI-Kacheln
 * @layer     Web · View (Seite)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { Link } from 'react-router-dom';
import RegionOverview from '@/components/RegionOverview';
import ForecastStrip from '@/components/ForecastCard';
import { useCore, useResource } from '@/core';
import { ENTITIES } from '@/lib/entities';
import { formatMinutes } from '@/lib/format';
import { Badge, ErrorBox, Icon, Loading, Page, PageHeader, cx } from '@/ui';

/** Stammdaten-Übersicht: KPI-Kacheln oben, darunter die Bereiche als Index-Karten */
export default function StammdatenIndex() {
  const core = useCore();
  const { system, routen } = core;
  const overview = useResource(system.overview);
  const stamm = useResource(system.stammdaten);
  const plan = useResource(routen.plan);
  useResource(system.forecast); // Bilanz braucht die Vorplanung („vorgeplant“ statt „Warteliste“)
  if (overview.error || stamm.error) return <ErrorBox message={(overview.error ?? stamm.error)!} onRetry={() => { overview.reload(); stamm.reload(); }} />;
  if (!overview.data || !stamm.data) return <Loading />;

  const o = overview.data;
  const d = stamm.data;
  const issuesFor = (kind: string) =>
    new Set(d.issues.filter((i) => i.entity === kind && i.severity !== 'info').map((i) => i.entityId)).size;
  // Anfragen: Zahlen aus der Bilanz (gleiche Quelle wie Prognose, Planer und Liste – die Teile ergeben die Gesamtzahl)
  const b = plan.data ? core.balance(plan.data) : null;
  const fixed = d.appointments.filter((a) => !a.simulated).length;
  const fromApprovals = d.appointments.length - fixed;
  const counts: Record<string, number> = {
    anfragen: b?.total ?? d.requests.length + (d.convertedRequests?.length ?? 0),
    techniker: d.technicians.length,
    termine: d.appointments.length,
    verfuegbarkeiten: d.availability.length,
  };
  const blockedDays = d.availability.length - o.technicians.techDays;
  const hints: Record<string, string> = {
    anfragen: b
      ? [`${b.thisWeek} diese Woche`, b.preplanned && `${b.preplanned} vorgeplant`, b.waitlist && `${b.waitlist} Warteliste`, b.unplannable && `${b.unplannable} nicht planbar`, b.excluded && `${b.excluded} aus dem Plan`]
          .filter(Boolean)
          .join(' · ')
      : 'Plan wird berechnet …',
    techniker: `Diese Woche: ${o.technicians.available} von ${d.technicians.length} verfügbar · ${formatMinutes(o.driveMinutes)} Fahrzeit in allen Routen`,
    termine: fromApprovals ? `${fixed} fix · ${fromApprovals} aus freigegebenen Routen` : 'Nicht verschiebbar – die Routen werden darum herum geplant',
    verfuegbarkeiten: `Diese Woche: ${o.technicians.techDays} Arbeitstage${blockedDays > 0 ? `, ${blockedDays} gesperrt (Urlaub, krank)` : ''}`,
  };

  return (
    <Page>
      <PageHeader
        title="Übersicht"
        subtitle={
          <>
            Planungszeitraum {system.periodLabel(d.range)} · Datenquelle{' '}
            <span className={cx('font-medium', d.source === 'live' ? 'text-brand-600' : 'text-warning-600')}>{system.sourceLabel(d.source)}</span>
          </>
        }
        below={<ForecastStrip />}
      />

      {/* Eine Karte je Bereich – jede mit eigenem Prüfstatus */}
      <section className="mt-6 grid gap-3 md:grid-cols-2">
        {ENTITIES.map((e) => (
          <IndexCard
            key={e.slug}
            to={`/stammdaten/${e.slug}`}
            icon={e.icon}
            title={e.title}
            count={counts[e.slug]}
            hint={hints[e.slug] ?? e.description}
            issues={issuesFor(e.kind)}
            // Anfragen: Datenprobleme landen immer in „Nicht planbar“ bzw. sind Warnungen – gezeigt wird der Plan-Topf, der Klärung braucht
            badge={e.kind === 'request' && b ? (b.unplannable ? { label: `${b.unplannable} nicht planbar`, to: `/stammdaten/${e.slug}?filter=unplannable` } : null) : undefined}
          />
        ))}
      </section>

      {plan.data && <RegionOverview data={d} plan={plan.data} />}
    </Page>
  );
}

function IndexCard(props: { to: string; icon: string; title: string; count: number; hint: string; issues?: number; badge?: { label: string; to: string } | null }) {
  // Mit Problemen öffnet die Karte direkt die gefilterte Liste („Nur Probleme“); `badge` ersetzt die Datenprüfung (null = alles gut)
  const badge = props.badge !== undefined ? props.badge : props.issues ? { label: `${props.issues} prüfen`, to: `${props.to}?filter=problems` } : null;
  return (
    <Link to={badge?.to ?? props.to} className="card group flex items-center gap-4 px-5 py-4 transition hover:border-brand-300">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon name={props.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.title} <span className="font-normal text-gray-400">· {props.count}</span>
        </p>
        <p className="truncate text-sm text-gray-500">{props.hint}</p>
      </div>
      {badge ? (
        <Badge tone="danger">{badge.label}</Badge>
      ) : (
        <span className="shrink-0 text-xs font-medium text-brand-600">✓ in Ordnung</span>
      )}
      <Icon name="chevron" className="h-4 w-4 text-gray-300 transition group-hover:text-brand-500" />
    </Link>
  );
}
