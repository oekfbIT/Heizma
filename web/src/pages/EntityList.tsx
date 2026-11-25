import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import IssueBadge, { SeverityPill } from '@/components/ui/IssueBadge';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import RegionFilter from '@/components/ui/RegionFilter';
import { useApi, type Stammdaten } from '@/lib/api';
import { entityByKind, entityBySlug } from '@/lib/entities';
import { SEVERITY_ORDER, technicianColor } from '@/lib/format';
import { NO_REGION, requestInRegion, useRegion } from '@/lib/regions';
import type { Issue } from '@/lib/types';

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
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [query, setQuery] = useState('');
  const [region, setRegion] = useRegion();
  const techIds = data.technicians.map((t) => t.id);
  const colors = Object.fromEntries(techIds.map((id) => [id, technicianColor(id, techIds)]));

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
    if (onlyProblems && !problems) return false;
    if (!query) return true;
    return Object.values(row.cells).join(' ').toLowerCase().includes(query.toLowerCase());
  });
  const problemCount = def.rows(data).filter((r) => (issuesById.get(r.id) ?? []).some((i) => i.severity !== 'info')).length;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10">
      <PageHead title={def.title} subtitle={def.description} />

      <div className="mt-6">
        <RegionFilter technicians={data.technicians} colors={colors} value={region} onChange={setRegion} showUnassigned={def.kind === 'request' || def.kind === 'technician'} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className="input pl-9" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 text-sm">
          {[
            { v: false, label: `Alle (${def.rows(data).length})` },
            { v: true, label: `Nur Probleme (${problemCount})` },
          ].map((opt) => (
            <button
              key={String(opt.v)}
              onClick={() => setOnlyProblems(opt.v)}
              className={`rounded-md px-3 py-1.5 font-medium transition ${onlyProblems === opt.v ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card mt-4 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {def.columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 font-medium ${c.className ?? ''}`}>
                  {c.label}
                </th>
              ))}
              <th className="w-36 px-4 py-3 font-medium">Status</th>
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
                    <td key={c.key} className={`px-4 py-3 ${c.key === 'id' ? 'font-mono text-xs text-gray-500' : ''}`}>
                      {row.cells[c.key]}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <IssueBadge issues={issues} />
                  </td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={def.columns.length + 1} className="px-4 py-10 text-center text-gray-400">
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
    <main className="mx-auto w-full max-w-[1440px] px-6 py-8 lg:px-10">
      <PageHead title="Handlungsbedarf" subtitle="Datensätze mit fehlenden oder ungültigen Angaben – Klick öffnet die Detailansicht" />
      <div className="card mt-6 divide-y divide-gray-100">
        {issues.map((issue, idx) => {
          const def = entityByKind(issue.entity);
          return (
            <Link
              key={`${issue.entityId}-${issue.code}-${idx}`}
              to={`/stammdaten/${def.slug}/${encodeURIComponent(issue.entityId)}`}
              className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-gray-50"
            >
              <SeverityPill severity={issue.severity} />
              <span className="w-40 shrink-0 text-xs font-medium uppercase tracking-wider text-gray-400">{def.title}</span>
              <span className="w-28 shrink-0 font-mono text-xs text-gray-500">{issue.entityId}</span>
              <span className="flex-1 text-sm">{issue.message}</span>
              <Icon name="chevron" className="h-4 w-4 text-gray-300" />
            </Link>
          );
        })}
        {!issues.length && <p className="px-5 py-10 text-center text-sm text-gray-400">Alles sauber – kein Handlungsbedarf 🎉</p>}
      </div>
    </main>
  );
}
