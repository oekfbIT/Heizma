import { Link } from 'react-router-dom';
import RegionOverview from '@/components/RegionOverview';
import Icon from '@/components/ui/Icon';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { useApi, type Overview, type Stammdaten } from '@/lib/api';
import { ENTITIES } from '@/lib/entities';
import { formatDay, formatMinutes } from '@/lib/format';
import type { Plan } from '@/lib/types';

/** Stammdaten-Übersicht: KPI-Kacheln oben, darunter die Bereiche als Index-Karten */
export default function StammdatenIndex() {
  const overview = useApi<Overview>('/api/overview');
  const stamm = useApi<Stammdaten>('/api/stammdaten');
  const plan = useApi<Plan>('/api/plan');
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
  const hints: Record<string, string> = {
    anfragen: `${o.requests.planned} eingeplant · ${o.requests.open} offen`,
    techniker: `${o.technicians.available} verfügbar · ${formatMinutes(o.driveMinutes)} Fahrzeit`,
    termine: 'fix – bleiben, wo sie sind',
    verfuegbarkeiten: `${o.technicians.techDays} Einsatztage`,
  };

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stammdaten</h1>
          <p className="mt-1 text-sm text-gray-500">
            Planungszeitraum {formatDay(d.range.from)} – {formatDay(d.range.to)} · Datenquelle{' '}
            <span className={d.source === 'live' ? 'font-medium text-brand-600' : 'font-medium text-amber-600'}>
              {d.source === 'live' ? 'Heizma Case-Study-API' : 'Mock-Daten (offline)'}
            </span>
          </p>
        </div>
        <Link to="/planer" className="btn-secondary">
          <Icon name="route" className="h-4 w-4" /> Zur Routenplanung
        </Link>
      </div>

      {/* Ein Raster statt KPI-Kacheln + Index-Karten: jede Zahl genau einmal */}
      <section className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <IndexCard
          to="/stammdaten/handlungsbedarf"
          icon="alert"
          title="Handlungsbedarf"
          count={o.actionRequired.total}
          hint={`${o.actionRequired.technicians} Außendienstler · ${o.actionRequired.requests} Anfragen · ${o.actionRequired.appointments} Termine`}
          tone={o.actionRequired.total ? 'danger' : undefined}
        />
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

    </main>
  );
}

function IndexCard(props: { to: string; icon: string; title: string; count: number; hint: string; issues?: number; tone?: 'danger' }) {
  return (
    <Link to={props.to} className="card group flex items-center gap-4 px-5 py-4 transition hover:border-brand-300">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${props.tone ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'}`}>
        <Icon name={props.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.title} <span className={`font-normal ${props.tone ? 'text-red-600' : 'text-gray-400'}`}>· {props.count}</span>
        </p>
        <p className="truncate text-sm text-gray-500">{props.hint}</p>
      </div>
      {!!props.issues && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">{props.issues} prüfen</span>
      )}
      <Icon name="chevron" className="h-4 w-4 text-gray-300 transition group-hover:text-brand-500" />
    </Link>
  );
}
