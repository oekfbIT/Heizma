import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import { SeverityPill } from '@/components/ui/IssueBadge';
import { ErrorBox, Loading } from '@/components/ui/PageState';
import { useApi, type Stammdaten } from '@/lib/api';
import { entityBySlug } from '@/lib/entities';
import type { Issue } from '@/lib/types';

const FIELD_STYLE: Record<string, string> = {
  error: 'border-red-400 bg-red-50/50 focus:border-red-500 focus:ring-red-100',
  warning: 'border-amber-400 bg-amber-50/50 focus:border-amber-500 focus:ring-amber-100',
};

/**
 * Detail-/Bearbeitungsansicht. Die Case-Study-API ist read-only:
 * Felder mit Befund werden markiert, Speichern ist bewusst deaktiviert.
 */
export default function EntityEdit() {
  const { entity: slug, id: rawId } = useParams();
  const id = decodeURIComponent(rawId ?? '');
  const { data, error, reload } = useApi<Stammdaten>('/api/stammdaten');
  const def = entityBySlug(slug);
  const [draft, setDraft] = useState<Record<string, string>>({});

  if (!def) return <Navigate to="/stammdaten" replace />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return <Loading />;

  const record = def.find(data, id) as Record<string, unknown> | undefined;
  if (!record) return <ErrorBox message={`${id} nicht gefunden`} />;

  const issues = data.issues.filter((i) => i.entity === def.kind && i.entityId === id);
  const issuesFor = (field: string) => issues.filter((i) => i.field === field && i.severity !== 'info');
  const unplacedIssues = issues.filter((i) => !def.fields.some((f) => f.key === i.field));

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-8">
      <Link to={`/stammdaten/${def.slug}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
        <Icon name="back" className="h-4 w-4" /> {def.title}
      </Link>
      <div className="mt-2 flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{id}</h1>
        {issues.filter((i) => i.severity !== 'info').length === 0 && (
          <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">✓ Daten vollständig</span>
        )}
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Die Case-Study-API ist <strong>read-only</strong>. Problematische Felder werden hier markiert – Korrekturen
          würden in Produktion zurück ins CRM geschrieben.
        </p>
      </div>

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

      <form className="card mt-6 space-y-5 p-6" onSubmit={(e) => e.preventDefault()}>
        {def.fields.map((field) => {
          const fieldIssues: Issue[] =
            field.key === 'availability' ? unplacedIssues.filter((i) => i.severity !== 'info') : issuesFor(field.key);
          const severity = fieldIssues[0]?.severity;
          const value = draft[field.key] ?? field.value(record);
          const cls = `input ${severity ? FIELD_STYLE[severity] ?? '' : ''}`;
          return (
            <label key={field.key} className="block">
              <span className="mb-1.5 flex items-center gap-2 text-sm font-medium">
                {field.label}
                {severity && <SeverityPill severity={severity} />}
              </span>
              {field.multiline ? (
                <textarea rows={3} className={cls} value={value} placeholder="— fehlt —" onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} />
              ) : (
                <input className={cls} value={value === '—' ? '' : value} placeholder="— fehlt —" onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })} />
              )}
              {fieldIssues.map((i) => (
                <span key={i.code} className={`mt-1 block text-xs ${i.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                  {i.message}
                </span>
              ))}
            </label>
          );
        })}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
          <button type="button" className="btn-secondary" onClick={() => setDraft({})}>
            Zurücksetzen
          </button>
          <button type="submit" className="btn-primary" disabled title="Read-only API – Speichern nicht möglich">
            Speichern
          </button>
        </div>
      </form>
    </main>
  );
}
