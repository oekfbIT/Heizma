import { Link } from 'react-router-dom';
import RegionOverview from '@/components/RegionOverview';
import { useCore, useResource } from '@/core';
import { ENTITIES } from '@/lib/entities';
import { formatMinutes } from '@/lib/format';
import { Badge, ErrorBox, Icon, Loading, Page, PageHeader, cx } from '@/ui';

/** Stammdaten-Übersicht: KPI-Kacheln oben, darunter die Bereiche als Index-Karten */
export default function StammdatenIndex() {
  const { system, routen } = useCore();
  const overview = useResource(system.overview);
  const stamm = useResource(system.stammdaten);
  const plan = useResource(routen.plan);
  if (overview.error || stamm.error) return <ErrorBox message={(overview.error ?? stamm.error)!} onRetry={() => { overview.reload(); stamm.reload(); }} />;
  if (!overview.data || !stamm.data) return <Loading />;

  const o = overview.data;
  const d = stamm.data;
  const issuesFor = (kind: string) =>
    new Set(d.issues.filter((i) => i.entity === kind && i.severity !== 'info').map((i) => i.entityId)).size;
  const counts: Record<string, number> = {
    anfragen: d.requests.length,
    techniker: d.technicians.length,
    termine: d.appointments.length,
    verfuegbarkeiten: d.availability.length,
  };
  const blockedDays = d.availability.length - o.technicians.techDays;
  const hints: Record<string, string> = {
    anfragen: `Diese Woche: ${o.requests.planned} eingeplant, ${o.requests.open} nicht eingeplant`,
    techniker: `Diese Woche: ${o.technicians.available} von ${d.technicians.length} verfügbar · ${formatMinutes(o.driveMinutes)} Fahrzeit in allen Routen`,
    termine: 'Nicht verschiebbar – die Routen werden darum herum geplant',
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
        actions={
          <Link to="/planer" className="btn btn--secondary">
            <Icon name="route" className="h-4 w-4" /> Zur Routenplanung
          </Link>
        }
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
          />
        ))}
      </section>

      {plan.data && <RegionOverview data={d} plan={plan.data} />}
    </Page>
  );
}

function IndexCard(props: { to: string; icon: string; title: string; count: number; hint: string; issues?: number }) {
  // Mit Problemen öffnet die Karte direkt die gefilterte Liste („Nur Probleme“)
  return (
    <Link to={props.issues ? `${props.to}?filter=problems` : props.to} className="card group flex items-center gap-4 px-5 py-4 transition hover:border-brand-300">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
        <Icon name={props.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.title} <span className="font-normal text-gray-400">· {props.count}</span>
        </p>
        <p className="truncate text-sm text-gray-500">{props.hint}</p>
      </div>
      {props.issues ? (
        <Badge tone="danger">{props.issues} prüfen</Badge>
      ) : (
        <span className="shrink-0 text-xs font-medium text-brand-600">✓ in Ordnung</span>
      )}
      <Icon name="chevron" className="h-4 w-4 text-gray-300 transition group-hover:text-brand-500" />
    </Link>
  );
}
