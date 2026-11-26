import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import IssueBadge, { SeverityPill } from '@/components/ui/IssueBadge';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import RegionFilter from '@/components/ui/RegionFilter';
import { useApi, type Stammdaten } from '@/lib/api';
import { entityByKind, entityBySlug } from '@/lib/entities';
import { formatDay, SEVERITY_ORDER, technicianColor } from '@/lib/format';
import { NO_REGION, requestInRegion, useRegion } from '@/lib/regions';
import type { Issue, Plan } from '@/lib/types';

/** Auf Mobil sichtbare Spalten (Rest ab md) */
const MOBILE = new Set(['customer', 'address', 'name', 'tech', 'date', 'window', 'start']);

/** Liste eines Stammdaten-Bereichs mit Validierungsstatus pro Zeile */
export default function EntityList() {
  const { entity: slug } = useParams();
  const { data, error, reload } = useApi<Stammdaten>('/api/stammdaten');

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (slug === 'handlungsbedarf') return <IssueList data={data} />;

  const def = entityBySlug(slug);
  if (!def) return <Navigate to="/stammdaten" replace />;
  return <Table data={data} slug={def.slug} />;
}

function PageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <Link to="/stammdaten" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
        <Icon name="back" className="h-4 w-4" /> Stammdaten
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
    </div>
  );
}

function Table({ data, slug }: { data: Stammdaten; slug: string }) {
  const def = entityBySlug(slug)!;
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'problems' | 'planned'>('all');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useRegion();
  const techIds = data.technicians.map((t) => t.id);
  const colors = Object.fromEntries(techIds.map((id) => [id, technicianColor(id, techIds)]));
  // Nur bei Anfragen: Stand im Tourenplan je Zeile
  const plan = useApi<Plan>(def.kind === 'request' ? '/api/plan' : null);
  const planStatus = useMemo(() => (plan.data ? planStatusById(plan.data, data) : null), [plan.data, data]);

  /** Gehört der Datensatz zur gewählten Region? */
  const inRegion = (id: string) => {
    if (!region) return true;
    const rec = def.find(data, id) as Record<string, any> | undefined;
    if (!rec) return false;
    if (def.kind === 'request') return requestInRegion(data, id, region);
    if (def.kind === 'technician') return region === NO_REGION ? (rec.region?.length ?? 0) < 3 : rec.id === region;
    return rec.technicianId === region;
  };

  const issuesById = useMemo(() => {
    const map = new Map<string, Issue[]>();
    data.issues.filter((i) => i.entity === def.kind).forEach((i) => map.set(i.entityId, [...(map.get(i.entityId) ?? []), i]));
    return map;
  }, [data, def.kind]);

  const rows = def.rows(data).filter((row) => {
    if (!inRegion(row.id)) return false;
    const problems = (issuesById.get(row.id) ?? []).some((i) => i.severity !== 'info');
    if (filter === 'problems' && !problems) return false;
    if (filter === 'planned' && !planStatus?.get(row.id)?.planned) return false;
    if (!query) return true;
    return Object.values(row.cells).join(' ').toLowerCase().includes(query.toLowerCase());
  });
  const problemCount = def.rows(data).filter((r) => (issuesById.get(r.id) ?? []).some((i) => i.severity !== 'info')).length;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8 lg:px-10">
      <PageHead title={def.title} subtitle={def.description} />

      <div className="mt-6">
        <RegionFilter technicians={data.technicians} colors={colors} value={region} onChange={setRegion} showUnassigned={def.kind === 'request' || def.kind === 'technician'} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className="input pl-9" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          {[
            { v: 'all' as const, label: `Alle (${def.rows(data).length})` },
            { v: 'problems' as const, label: `Nur Probleme (${problemCount})` },
            ...(def.kind === 'request' ? [{ v: 'planned' as const, label: `Eingeplant (${planStatus ? def.rows(data).filter((r) => planStatus.get(r.id)?.planned).length : '…'})` }] : []),
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setFilter(opt.v)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${filter === opt.v ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {def.columns.map((c) => (
                <th key={c.key} className={`px-3 py-3 font-medium md:px-4 ${c.className ?? ''} ${MOBILE.has(c.key) ? '' : 'hidden md:table-cell'}`}>
                  {c.label}
                </th>
              ))}
              {def.kind === 'request' && <th className="w-44 px-3 py-3 font-medium md:px-4">Plan</th>}
              <th className="w-28 px-3 py-3 font-medium md:w-36 md:px-4">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const issues = issuesById.get(row.id) ?? [];
              const hasError = issues.some((i) => i.severity === 'error');
              return (
                <tr
                  key={row.id}
                  onClick={() => navigate(`/stammdaten/${def.slug}/${encodeURIComponent(row.id)}`)}
                  className={`cursor-pointer transition hover:bg-brand-50/50 ${hasError ? 'bg-red-50/40' : ''}`}
                >
                  {def.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-3 md:px-4 ${c.key === 'id' ? 'font-mono text-xs text-gray-500' : ''} ${c.key === 'customer' || c.key === 'id' ? 'whitespace-nowrap' : ''} ${MOBILE.has(c.key) ? '' : 'hidden md:table-cell'}`}>
                      {row.cells[c.key]}
                    </td>
                  ))}
                  {def.kind === 'request' && (
                    <td className="px-3 py-3 md:px-4">
                      {planStatus ? <PlanChip s={planStatus.get(row.id)} /> : <span className="text-xs text-gray-300">…</span>}
                    </td>
                  )}
                  <td className="px-3 py-3 md:px-4">
                    <IssueBadge issues={issues} />
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={def.columns.length + (def.kind === 'request' ? 2 : 1)} className="px-4 py-10 text-center text-gray-400">
                  Keine Einträge
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function IssueList({ data }: { data: Stammdaten }) {
  const issues = data.issues
    .filter((i) => i.severity !== 'info')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.entity.localeCompare(b.entity));

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-8 lg:px-10">
      <PageHead title="Handlungsbedarf" subtitle="Datensätze mit fehlenden oder ungültigen Angaben – ein Klick öffnet die Detailansicht" />
      <div className="card mt-6 divide-y divide-gray-100">
        {issues.map((issue, idx) => {
          const def = entityByKind(issue.entity);
          return (
            <Link
              key={`${issue.entityId}-${issue.code}-${idx}`}
              to={`/stammdaten/${def.slug}/${encodeURIComponent(issue.entityId)}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 transition hover:bg-gray-50 md:flex-nowrap md:px-5"
            >
              <SeverityPill severity={issue.severity} />
              <span className="shrink-0 text-xs font-medium uppercase tracking-wider text-gray-400 md:w-40">{def.title}</span>
              <span className="shrink-0 font-mono text-xs text-gray-500 md:w-28">{issue.entityId}</span>
              <span className="w-full text-sm md:w-auto md:flex-1">{issue.message}</span>
              <Icon name="chevron" className="h-4 w-4 text-gray-300" />
            </Link>
          );
        })}
        {!issues.length && <p className="px-5 py-10 text-center text-sm text-gray-400">Alles sauber – kein Handlungsbedarf 🎉</p>}
      </div>
    </main>
  );
}

interface PlanStatus {
  planned: boolean;
  label: string;
  tone: string;
  title: string;
}

/** Wo steht jede Anfrage im Tourenplan? Eingeplant (Tag · Person), Warteliste, aus Plan genommen, nicht planbar. */
function planStatusById(plan: Plan, data: Stammdaten): Map<string, PlanStatus> {
  const map = new Map<string, PlanStatus>();
  const short = (id: string) => data.technicians.find((t) => t.id === id)?.name.replace(/^Techniker\s+/i, '') ?? id;
  for (const r of plan.routes)
    for (const s of r.stops) {
      if (s.kind !== 'request') continue;
      const pin = s.manual?.mode === 'pin' ? '📌 ' : '';
      map.set(s.id, {
        planned: true,
        label: `${pin}${formatDay(r.date)} · ${short(r.technicianId)}`,
        tone: r.approved ? 'bg-brand-500 text-white' : 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200',
        title: `${r.approved ? 'Freigegeben' : 'Vorgeschlagen'}: ${s.start}–${s.end}`,
      });
    }
  for (const u of plan.unassigned) {
    const [label, tone] = u.reason.startsWith('Kapazität')
      ? ['Warteliste', 'bg-amber-100 text-amber-800']
      : u.reason.startsWith('Aus dem Plan')
        ? ['Aus dem Plan genommen', 'bg-gray-200 text-gray-700']
        : ['Nicht planbar', 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200'];
    map.set(u.requestId, { planned: false, label, tone, title: u.reason });
  }
  return map;
}

function PlanChip({ s }: { s?: PlanStatus }) {
  if (!s) return <span className="text-xs text-gray-300">—</span>;
  return (
    <span title={s.title} className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${s.tone}`}>
      {s.label}
    </span>
  );
}
