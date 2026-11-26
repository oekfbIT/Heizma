/**
 * @file      Protokoll.tsx – Seite: Aktivitätsprotokoll (Freigaben, Eingriffe, Korrekturen mit Begründung)
 * @layer     Web · View (Seite)
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore, useResource } from '@/core';
import { formatDateTime } from '@/lib/format';
import { LOG_CATEGORY_LABEL, type LogCategory, type LogItem } from '@/modules';
import { Badge, Card, ErrorBox, Icon, Input, Loading, Page, PageHeader, SegmentedControl, type BadgeTone } from '@/ui';

type Filter = LogCategory | 'all';

const TONE: Record<LogCategory, BadgeTone> = {
  freigabe: 'success',
  planung: 'info',
  eskalation: 'warning-soft',
  korrektur: 'accent',
  notiz: 'info-soft',
  system: 'neutral',
};

/**
 * Internes Aktivitätsprotokoll: wann wurde welche Route freigegeben, was verschoben,
 * eskaliert oder korrigiert – mit Begründung. Wird mit „Demo zurücksetzen“ geleert.
 */
export default function Protokoll() {
  const core = useCore();
  const log = useResource(core.system.log);
  const techniker = useResource(core.techniker.data); // Kurznamen der Personen
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  const items = useMemo(() => (log.data ? core.logItems(log.data) : []), [core, log.data, techniker.data]);
  const counts = core.system.logCounts(items);
  const rows = items.filter((it) => {
    if (filter !== 'all' && it.category !== filter) return false;
    if (!query) return true;
    return [it.action, it.target.label, it.detail, it.reason ?? '', LOG_CATEGORY_LABEL[it.category]].join(' ').toLowerCase().includes(query.toLowerCase());
  });

  if (log.error) return <ErrorBox message={log.error} onRetry={log.reload} />;
  if (!log.data) return <Loading />;

  const categories = (Object.keys(LOG_CATEGORY_LABEL) as LogCategory[]).filter((c) => counts[c] > 0 || c === filter);

  return (
    <Page>
      <PageHeader
        title="Aktivitätsprotokoll"
        subtitle="Was in der Planung wann passiert ist: Freigaben, Eingriffe, Eskalationen und Korrekturen – mit Begründung. Wird mit „Demo zurücksetzen“ geleert."
      />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input className="pl-9" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all' as Filter, label: `Alle (${counts.all})` },
            ...categories.map((c) => ({ value: c as Filter, label: `${LOG_CATEGORY_LABEL[c]} (${counts[c]})` })),
          ]}
        />
      </div>

      <Card className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="w-40 px-3 py-3 font-medium md:px-4">Zeit</th>
              <th className="hidden w-36 px-3 py-3 font-medium md:table-cell md:px-4">Bereich</th>
              <th className="px-3 py-3 font-medium md:px-4">Aktion</th>
              <th className="px-3 py-3 font-medium md:px-4">Betrifft</th>
              <th className="hidden px-3 py-3 font-medium md:table-cell md:px-4">Details</th>
              <th className="hidden px-3 py-3 font-medium lg:table-cell lg:px-4">Begründung</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((it) => (
              <Row key={it.key} item={it} />
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                  {items.length ? 'Keine Einträge für diesen Filter' : 'Noch keine Aktivität – Freigaben, Eingriffe und Korrekturen erscheinen hier.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </Page>
  );
}

function Row({ item }: { item: LogItem }) {
  return (
    <tr className="align-top">
      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-gray-500 md:px-4">{formatDateTime(toLocal(item.at))}</td>
      <td className="hidden px-3 py-3 md:table-cell md:px-4">
        <Badge tone={TONE[item.category]}>{LOG_CATEGORY_LABEL[item.category]}</Badge>
      </td>
      <td className="px-3 py-3 font-medium md:px-4">
        {item.action}
        {item.exception && (
          <Badge tone="warning" className="ml-2">
            Bewusste Ausnahme
          </Badge>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 md:px-4">
        {item.target.to ? (
          <Link to={item.target.to} className="font-medium text-brand-600 hover:underline">
            {item.target.label}
          </Link>
        ) : (
          item.target.label
        )}
      </td>
      <td className="hidden px-3 py-3 text-gray-600 md:table-cell md:px-4">{item.detail || '—'}</td>
      <td className="hidden px-3 py-3 text-gray-600 lg:table-cell lg:px-4">{item.reason || '—'}</td>
    </tr>
  );
}

/** Server speichert UTC (ISO) → Ortszeit Wien für die Anzeige */
function toLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const parts = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Vienna', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  return parts.replace(' ', 'T');
}
