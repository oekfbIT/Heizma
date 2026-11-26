import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import AvailabilityWeek from '@/components/ui/AvailabilityWeek';
import LocationAssist from '@/components/LocationAssist';
import PolygonEditor from '@/components/ui/PolygonEditor';
import { SeverityPill } from '@/components/ui/IssueBadge';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { apiSend, useApi, type LocalDb, type Stammdaten } from '@/lib/api';
import Waitlist from '@/components/planner/Waitlist';
import TechnicianEscalation from '@/components/TechnicianEscalation';
import RequestPlanningCard from '@/components/RequestPlanningCard';
import { entityBySlug } from '@/lib/entities';
import type { Plan } from '@/lib/types';
import type { EntityKind, Issue, ServiceRequest, Technician } from '@/lib/types';

const FIELD_STYLE: Record<string, string> = {
  error: 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-100',
  warning: 'border-amber-400 bg-amber-50/50 focus:border-amber-500 focus:ring-amber-100',
};

const ENTITY_KEY: Partial<Record<EntityKind, 'requests' | 'technicians' | 'appointments'>> = {
  request: 'requests',
  technician: 'technicians',
  appointment: 'appointments',
};

/**
 * Detail-/Bearbeitungsansicht.
 * Die Case-Study-API ist read-only → Korrekturen gehen per PATCH an die eigene API
 * und werden lokal gespeichert (api/data/local-db.json). Validierung & Tourenplan
 * laufen danach auf den korrigierten Daten.
 */
export default function EntityEdit() {
  const { entity: slug, id: rawId } = useParams();
  const id = decodeURIComponent(rawId ?? '');
  const { data, error, reload } = useApi<Stammdaten>('/api/stammdaten');
  const localDb = useApi<LocalDb>('/api/local-db');
  const plan = useApi<Plan>('/api/plan');
  const def = entityBySlug(slug);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDraft({});
    setMessage(null);
  }, [slug, id]);

  // Eskalationen o. Ä. ändern Daten außerhalb des Formulars → neu laden
  useEffect(() => {
    const onChange = () => reload();
    window.addEventListener('heizma:data-changed', onChange);
    return () => window.removeEventListener('heizma:data-changed', onChange);
  }, [reload]);

  if (!def) return <Navigate to="/stammdaten" replace />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const record = def.find(data, id) as Record<string, unknown> | undefined;
  if (!record) return <ErrorBox message={`${id} nicht gefunden`} />;

  const entityKey = ENTITY_KEY[def.kind];
  const editable = new Set(entityKey ? localDb.data?.editableFields?.[entityKey] ?? [] : []);
  const isOverridden = !!entityKey && (data.overridden?.[entityKey] ?? []).includes(id);
  const override = entityKey ? (localDb.data?.overrides?.[entityKey]?.[id] ?? {}) : {};

  const issues = data.issues.filter((i) => i.entity === def.kind && i.entityId === id);
  const issuesFor = (field: string) => issues.filter((i) => i.field === field && i.severity !== 'info');
  const unplacedIssues = issues.filter((i) => !def.fields.some((f) => f.key === i.field));
  const changes = Object.fromEntries(Object.entries(draft).filter(([k]) => editable.has(k)));
  const dirty = Object.keys(changes).length > 0;

  async function save() {
    if (!entityKey || !dirty) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiSend(`/api/stammdaten/${entityKey}/${encodeURIComponent(id)}`, 'PATCH', changes);
      setDraft({});
      reload();
      localDb.reload();
      window.dispatchEvent(new Event('heizma:data-changed')); // Planungs-Karte zeigt sofort den neuen Stand
      setMessage({ tone: 'ok', text: 'Gespeichert – Prüfung und Routenplanung wurden mit der Korrektur neu berechnet.' });
    } catch (e) {
      setMessage({ tone: 'error', text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function resetToOriginal() {
    if (!entityKey) return;
    setSaving(true);
    try {
      await apiSend(`/api/stammdaten/${entityKey}/${encodeURIComponent(id)}`, 'DELETE');
      setDraft({});
      reload();
      localDb.reload();
      window.dispatchEvent(new Event('heizma:data-changed'));
      setMessage({ tone: 'ok', text: 'Auf Originaldaten der Heizma-API zurückgesetzt.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-6 md:py-8">
      <Link to={`/stammdaten/${def.slug}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
        <Icon name="back" className="h-4 w-4" /> {def.title}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{id}</h1>
        {issues.filter((i) => i.severity !== 'info').length === 0 && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">✓ Daten vollständig</span>
        )}
        {isOverridden && (
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200">Lokal korrigiert</span>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Die Case-Study-API ist <strong>read-only</strong>. Korrekturen werden per <code>PATCH</code> an die eigene API
          gesendet und lokal gespeichert – Prüfung und Routenplanung nutzen sofort die korrigierten Daten. In Produktion
          würde derselbe Endpunkt ins CRM zurückschreiben.
        </p>
      </div>

      {message && (
        <div
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            message.tone === 'ok' ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {message.text}
          {message.tone === 'ok' && (
            <Link to="/planer" className="ml-2 font-semibold underline">
              Zur Routenplanung
            </Link>
          )}
        </div>
      )}

      {def.kind === 'request' && (
        <div className="mt-4">
          <RequestPlanningCard requestId={id} onChanged={() => { reload(); plan.reload(); }} />
        </div>
      )}

      {issues.length > 0 && (
        <div className="card mt-4 divide-y divide-gray-100">
          {issues.map((i, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-3 text-sm">
              <SeverityPill severity={i.severity} />
              <span>{i.message}</span>
            </div>
          ))}
        </div>
      )}

      {def.kind === 'technician' && <TechnicianEscalation technician={record as unknown as Technician} issues={issues} data={data} />}

      {def.kind === 'request' && (
        <LocationAssist
          key={id}
          request={record as unknown as ServiceRequest}
          address={draft.address ?? String(record.address ?? '')}
          lat={draft.lat ?? (record.lat == null ? '' : String(record.lat))}
          lng={draft.lng ?? (record.lng == null ? '' : String(record.lng))}
          onFill={(patch) => setDraft({ ...draft, ...patch })}
          escalated={!!data.escalations?.[id]}
          onEscalated={reload}
        />
      )}

      {/* Wartet trotz gültiger Daten (Kapazität) → Kunde über Verzögerung informieren */}
      {def.kind === 'request' && (() => {
        const u = plan.data?.unassigned.filter((x) => x.requestId === id && x.reason.startsWith('Kapazität')) ?? [];
        return u.length > 0 ? (
          <div className="mt-6">
            <Waitlist items={u} requests={data.requests} escalations={data.escalations ?? {}} nextWorkday={data.range.to} onChanged={() => { reload(); plan.reload(); }} />
          </div>
        ) : null;
      })()}

      <form
        className="card mt-6 space-y-5 p-4 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {def.fields.map((field) => {
          const fieldIssues: Issue[] =
            field.key === 'availability' ? unplacedIssues.filter((i) => i.severity !== 'info') : issuesFor(field.key);
          const severity = fieldIssues[0]?.severity;
          const canEdit = editable.has(field.key);
          const changed = field.key in override;
          const value = draft[field.key] ?? field.value(record);
          const cls = `input ${severity ? FIELD_STYLE[severity] ?? '' : ''} ${canEdit ? '' : 'cursor-not-allowed bg-gray-50 text-gray-500'}`;
          return (
            <div key={field.key} className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                {field.label}
                {severity && <SeverityPill severity={severity} />}
                {changed && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">geändert</span>}
                {!canEdit && <Icon name="lock" className="h-3.5 w-3.5 text-gray-300" />}
              </span>
              {field.key === 'availability' && def.kind === 'technician' ? (
                <AvailabilityWeek data={data} technicianId={id} />
              ) : field.key === 'region' && def.kind === 'technician' ? (
                <PolygonEditor
                  value={value === '—' ? '' : value}
                  data={data}
                  readOnly={!canEdit}
                  className={severity ? FIELD_STYLE[severity] ?? '' : ''}
                  onChange={(v) => setDraft({ ...draft, [field.key]: v })}
                />
              ) : field.multiline ? (
                <textarea
                  rows={3}
                  className={cls}
                  value={value === '—' ? '' : value}
                  placeholder={field.key === 'region' ? 'Eine Zeile pro Eckpunkt: 48.20, 16.30' : '— fehlt —'}
                  readOnly={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              ) : (
                <input
                  className={cls}
                  value={value === '—' ? '' : value}
                  placeholder="— fehlt —"
                  readOnly={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              )}
              {fieldIssues.map((i) => (
                <span key={i.code} className={`mt-1 block text-xs ${i.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                  {i.message}
                </span>
              ))}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
          {isOverridden && (
            <button type="button" className="btn-secondary mr-auto" onClick={() => void resetToOriginal()} disabled={saving}>
              Original wiederherstellen
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => setDraft({})} disabled={!dirty}>
            Verwerfen
          </button>
          <button type="submit" className="btn-primary" disabled={!entityKey || !dirty || saving}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </main>
  );
}
