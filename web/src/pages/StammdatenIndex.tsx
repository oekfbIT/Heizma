import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import StatCard from '@/components/ui/StatCard';
import { useApi, type Overview, type Stammdaten } from '@/lib/api';
import { ENTITIES } from '@/lib/entities';
import { formatDay, formatMinutes } from '@/lib/format';

/** Stammdaten-Übersicht: KPI-Kacheln oben, darunter die Bereiche als Index-Karten */
export default function StammdatenIndex() {
  const overview = useApi<Overview>('/api/overview');
  const stamm = useApi<Stammdaten>('/api/stammdaten');

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

  return (
    <main className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10">
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
          <Icon name="route" className="h-4 w-4" /> Zum Tourenplan
        </Link>
      </div>

      {/* KPI-Kacheln */}
      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Anfragen eingeplant"
          value={
            <>
              {o.requests.planned}
              <span className="text-xl font-medium text-gray-400"> / {o.requests.total}</span>
            </>
          }
          progress={o.requests.total ? o.requests.planned / o.requests.total : 0}
          hint={`${o.requests.open} offen auf der Warteliste`}
          tone={o.requests.open ? 'warning' : 'success'}
          to="/planer"
        />
        <StatCard
          label="Handlungsbedarf"
          value={o.actionRequired.total}
          hint={`${o.actionRequired.technicians} Techniker · ${o.actionRequired.requests} ${o.actionRequired.requests === 1 ? 'Anfrage' : 'Anfragen'} · ${o.actionRequired.appointments} ${o.actionRequired.appointments === 1 ? 'Termin' : 'Termine'}`}
          tone={o.actionRequired.total ? 'danger' : 'success'}
          to="/stammdaten/handlungsbedarf"
        />
        <StatCard
          label="Fixe Termine"
          value={o.appointments.fixed}
          hint="bleiben, wo sie sind"
          to="/stammdaten/termine"
        />
        <StatCard
          label="Techniker verfügbar"
          value={
            <>
              {o.technicians.available}
              <span className="text-xl font-medium text-gray-400"> / {o.technicians.total}</span>
            </>
          }
          hint={`${o.technicians.techDays} Einsatztage · ${formatMinutes(o.driveMinutes)} Fahrzeit geplant`}
          to="/stammdaten/techniker"
        />
      </section>

      {/* Index-Karten */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Bereiche</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <IndexCard
            to="/stammdaten/handlungsbedarf"
            icon="alert"
            title="Handlungsbedarf"
            description="Fehlende oder ungültige Daten, die vor der Planung geprüft werden sollten"
            count={o.actionRequired.total}
            issues={o.actionRequired.errors}
            highlight
          />
          {ENTITIES.map((e) => (
            <IndexCard
              key={e.slug}
              to={`/stammdaten/${e.slug}`}
              icon={e.icon}
              title={e.title}
              description={e.description}
              count={counts[e.slug]}
              issues={issuesFor(e.kind)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

function IndexCard(props: {
  to: string;
  icon: string;
  title: string;
  description: string;
  count: number;
  issues: number;
  highlight?: boolean;
}) {
  return (
    <Link to={props.to} className="card group flex items-center gap-4 px-5 py-4 transition hover:border-brand-300">
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          props.highlight && props.count ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-700'
        }`}
      >
        <Icon name={props.icon} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {props.title} <span className="font-normal text-gray-400">· {props.count}</span>
        </p>
        <p className="truncate text-sm text-gray-500">{props.description}</p>
      </div>
      {props.issues > 0 && (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
          {props.issues} prüfen
        </span>
      )}
      <Icon name="chevron" className="h-4 w-4 text-gray-300 transition group-hover:text-brand-500" />
    </Link>
  );
}
