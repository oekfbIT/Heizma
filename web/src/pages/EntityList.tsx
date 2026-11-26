/**
 * @file      EntityList.tsx – Seite: Liste eines Stammdaten-Bereichs mit Validierungsstatus
 * @layer     Web · View (Seite)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import IssueBadge, { SeverityPill } from '@/components/stammdaten/IssueBadge';
import RegionFilter from '@/components/stammdaten/RegionFilter';
import { useCore, useResource } from '@/core';
import { entityByKind, entityBySlug } from '@/lib/entities';
import { SEVERITY_ORDER } from '@/lib/format';
import { NO_REGION, useRegion } from '@/lib/regions';
import type { Issue } from '@/lib/types';
import type { RequestPlanStatus, Stammdaten } from '@/modules';
import { Badge, Card, ErrorBox, Icon, Input, Loading, Page, PageHeader, SegmentedControl, type BadgeTone } from '@/ui';

/** Auf Mobil sichtbare Spalten (Rest ab md) */
const MOBILE = new Set(['customer', 'address', 'name', 'tech', 'date', 'window', 'start']);

/** Liste eines Stammdaten-Bereichs mit Validierungsstatus pro Zeile */
export default function EntityList() {
  const { entity: slug } = useParams();
  const core = useCore();
  const { data, error, reload } = useResource(core.system.stammdaten);
  useResource(core.anfragen.data); // Zuständigkeiten für den Regionsfilter

  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;
  if (slug === 'handlungsbedarf') return <IssueList data={data} />;

  const def = entityBySlug(slug);
  if (!def) return <Navigate to="/stammdaten" replace />;
  return <Table data={data} slug={def.slug} />;
}

function PageHead({ title, subtitle }: { title: string; subtitle: string }) {
  return <PageHeader title={title} subtitle={subtitle} back={{ to: '/stammdaten', label: 'Übersicht' }} />;
}

function Table({ data, slug }: { data: Stammdaten; slug: string }) {
  const def = entityBySlug(slug)!;
  const navigate = useNavigate();
  const core = useCore();
  const [params] = useSearchParams();
  type Filter = 'all' | 'problems' | 'planned' | 'approved' | 'preplanned' | 'waitlist' | 'unplannable' | 'excluded';
  const initial = params.get('filter') as Filter | null;
  // Bei Anfragen gibt es kein „Nur Probleme“: jedes Problem landet in einem Plan-Status
  const [filter, setFilter] = useState<Filter>(initial && !(def.kind === 'request' && initial === 'problems') && ['problems', 'planned', 'approved', 'preplanned', 'waitlist', 'unplannable', 'excluded'].includes(initial) ? initial : 'all');
  const [query, setQuery] = useState('');
  const [region, setRegion] = useRegion();
  const colors = core.techniker.colors(data.technicians);
  // Nur bei Anfragen: Stand im Plan je Zeile
  const plan = useResource(def.kind === 'request' ? core.routen.plan : null);
  useResource(def.kind === 'request' ? core.techniker.data : null); // Kurznamen für den Plan-Status
  // Vorplanung der Folgewochen (für den Status „Vorgeplant KW …“)
  const forecast = useResource(def.kind === 'request' ? core.system.forecast : null);
  const planStatus = useMemo(() => (plan.data ? core.requestStatuses(plan.data) : null), [core, plan.data, data, forecast.data]);

  /** Gehört der Datensatz zur gewählten Region? */
  const inRegion = (id: string) => {
    if (!region) return true;
    const rec = def.find(data, id) as Record<string, any> | undefined;
    if (!rec) return false;
    if (def.kind === 'request') return core.anfragen.inRegion(id, region);
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
    if (['approved', 'preplanned', 'waitlist', 'unplannable', 'excluded'].includes(filter) && planStatus?.get(row.id)?.tone !== filter) return false;
    if (!query) return true;
    return Object.values(row.cells).join(' ').toLowerCase().includes(query.toLowerCase());
  });
  const problemCount = def.rows(data).filter((r) => (issuesById.get(r.id) ?? []).some((i) => i.severity !== 'info')).length;

  return (
    <Page>
      <PageHead title={def.title} subtitle={def.description} />

      <div className="mt-6">
        <RegionFilter technicians={data.technicians} colors={colors} value={region} onChange={setRegion} showUnassigned={def.kind === 'request' || def.kind === 'technician'} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all' as const, label: `Alle (${def.rows(data).length})` },
            ...(def.kind !== 'request' ? [{ value: 'problems' as const, label: `Nur Probleme (${problemCount})` }] : []),
            ...(def.kind === 'request'
              ? (() => {
                  const all = def.rows(data);
                  const n = (f: (st: ReturnType<NonNullable<typeof planStatus>['get']>) => boolean) => (planStatus ? all.filter((r) => f(planStatus.get(r.id))).length : null);
                  // Die Tabs schließen sich gegenseitig aus und ergeben zusammen „Alle“ (gleiche Töpfe wie core.balance)
                  const tabs: { value: Filter; label: string; count: number | null }[] = [
                    { value: 'planned', label: 'Diese Woche', count: n((st) => !!st?.planned) },
                    { value: 'preplanned', label: 'Vorgeplant', count: n((st) => st?.tone === 'preplanned') },
                    { value: 'waitlist', label: 'Warteliste', count: n((st) => st?.tone === 'waitlist') },
                    { value: 'unplannable', label: 'Nicht planbar', count: n((st) => st?.tone === 'unplannable') },
                    { value: 'excluded', label: 'Aus dem Plan', count: n((st) => st?.tone === 'excluded') },
                  ];
                  // Leere Status ausblenden (außer dem aktiven), damit die Leiste kurz bleibt
                  return tabs.filter((t) => t.count !== 0 || t.value === filter).map((t) => ({ value: t.value, label: `${t.label} (${t.count ?? '…'})` }));
                })()
              : []),
          ]}
        />
      </div>

      <Card className="mt-4 overflow-x-auto">
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
                  className={`cursor-pointer transition hover:bg-brand-50/50 ${hasError ? 'bg-danger-50/40' : ''}`}
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
      </Card>
    </Page>
  );
}

function IssueList({ data }: { data: Stammdaten }) {
  const issues = data.issues
    .filter((i) => i.severity !== 'info')
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.entity.localeCompare(b.entity));

  return (
    <Page>
      <PageHead title="Handlungsbedarf" subtitle="Datensätze mit fehlenden oder ungültigen Angaben – ein Klick öffnet die Detailansicht" />
      <Card className="mt-6 divide-y divide-gray-100">
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
      </Card>
    </Page>
  );
}

/** Plan-Status (aus dem Routen-Modul) → Badge-Farbe */
const PLAN_TONE: Record<RequestPlanStatus['tone'], BadgeTone> = {
  approved: 'solid',
  proposed: 'success',
  preplanned: 'info-soft',
  waitlist: 'warning-soft',
  excluded: 'neutral',
  unplannable: 'danger',
};

function PlanChip({ s }: { s?: RequestPlanStatus }) {
  if (!s) return <span className="text-xs text-gray-300">—</span>;
  return (
    <Badge tone={PLAN_TONE[s.tone]} title={s.title}>
      {s.tone === 'preplanned' && <span className="mr-1 font-semibold">Vorgeplant</span>}
      {s.label}
    </Badge>
  );
}
