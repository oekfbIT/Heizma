/**
 * @file      EntityEdit.tsx – Seite: Detail/Bearbeiten eines Datensatzes – Korrekturen per PATCH (DATEN)
 * @layer     Web · View (Seite)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import LocationAssist from '@/components/LocationAssist';
import RequestPlanningCard from '@/components/RequestPlanningCard';
import AvailabilityWeek from '@/components/stammdaten/AvailabilityWeek';
import { SeverityPill } from '@/components/stammdaten/IssueBadge';
import PolygonEditor from '@/components/stammdaten/PolygonEditor';
import RegionPresetPicker from '@/components/stammdaten/RegionPresetPicker';
import TechnicianEscalation from '@/components/TechnicianEscalation';
import { useCore, useResource } from '@/core';
import { entityBySlug } from '@/lib/entities';
import type { EntityKind, Issue, ServiceRequest, Technician } from '@/lib/types';
import type { EntityKey } from '@/modules';
import { Alert, Badge, BackLink, Button, Card, ErrorBox, FieldMessage, Icon, Input, Loading, Page, Textarea, type FieldTone } from '@/ui';

const ENTITY_KEY: Partial<Record<EntityKind, EntityKey>> = {
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
  const core = useCore();
  const { data, error, reload } = useResource(core.system.stammdaten);
  const localDb = useResource(core.system.localDb);
  const plan = useResource(core.routen.plan);
  const def = entityBySlug(slug);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setDraft({});
    setMessage(null);
  }, [slug, id]);

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
      await core.updateEntity(entityKey, id, changes); // lädt Stammdaten, Prüfung und Plan neu
      setDraft({});
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
      await core.resetEntity(entityKey, id);
      setDraft({});
      setMessage({ tone: 'ok', text: 'Auf Originaldaten der Heizma-API zurückgesetzt.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Page narrow>
      <BackLink to={`/stammdaten/${def.slug}`}>{def.title}</BackLink>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title">{String(record?.customer ?? record?.name ?? id)}</h1>
        {Boolean(record?.customer || record?.name) && <span className="font-mono text-sm text-gray-400">{id}</span>}
        {issues.filter((i) => i.severity !== 'info').length === 0 && <Badge tone="success">✓ Daten vollständig</Badge>}
        {isOverridden && <Badge tone="info">Lokal korrigiert</Badge>}
      </div>

      <Alert tone="info" className="mt-4 flex items-start gap-3">
        <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Die Case-Study-API ist <strong>read-only</strong>. Korrekturen werden per <code>PATCH</code> an die eigene API
          gesendet und lokal gespeichert – Prüfung und Routenplanung nutzen sofort die korrigierten Daten. In Produktion
          würde derselbe Endpunkt ins CRM zurückschreiben.
        </p>
      </Alert>

      {message && (
        <Alert tone={message.tone === 'ok' ? 'success' : 'danger'} className="mt-4">
          {message.text}
          {message.tone === 'ok' && (
            <Link to="/planer" className="ml-2 font-semibold underline">
              Zur Routenplanung
            </Link>
          )}
        </Alert>
      )}

      {def.kind === 'request' && (
        <div className="mt-4">
          <RequestPlanningCard requestId={id} />
        </div>
      )}

      {issues.length > 0 && (
        <Card className="mt-4 divide-y divide-gray-100">
          {issues.map((i, idx) => (
            <div key={idx} className="flex items-center gap-3 px-4 py-3 text-sm">
              <SeverityPill severity={i.severity} />
              <span>{i.message}</span>
            </div>
          ))}
        </Card>
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
        />
      )}

      <Card
        as="form"
        className="mt-6 space-y-5 p-4 md:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        {def.fields.map((field) => {
          const fieldIssues: Issue[] =
            field.key === 'availability' ? unplacedIssues.filter((i) => i.severity !== 'info') : issuesFor(field.key);
          const severity = fieldIssues[0]?.severity;
          const tone: FieldTone = severity === 'error' || severity === 'warning' ? severity : undefined;
          const canEdit = editable.has(field.key);
          const changed = field.key in override;
          const value = draft[field.key] ?? field.value(record);
          return (
            <div key={field.key} className="block">
              <span className="field-label">
                {field.label}
                {severity && <SeverityPill severity={severity} />}
                {changed && <span className="rounded bg-info-50 px-1.5 py-0.5 text-[11px] font-medium text-info-700">geändert</span>}
                {!canEdit && <Icon name="lock" className="h-3.5 w-3.5 text-gray-300" />}
              </span>
              {field.key === 'availability' && def.kind === 'technician' ? (
                <AvailabilityWeek data={data} technicianId={id} />
              ) : field.key === 'region' && def.kind === 'technician' ? (
                <>
                {canEdit && (
                  <RegionPresetPicker
                    technician={record as unknown as Technician}
                    data={data}
                    value={value === '—' ? '' : value}
                    onPick={(text) => setDraft({ ...draft, [field.key]: text })}
                  />
                )}
                <PolygonEditor
                  value={value === '—' ? '' : value}
                  data={data}
                  readOnly={!canEdit}
                  className={tone ? `input--${tone}` : ''}
                  onChange={(v) => setDraft({ ...draft, [field.key]: v })}
                />
                </>
              ) : field.multiline ? (
                <Textarea
                  rows={3}
                  tone={tone}
                  value={value === '—' ? '' : value}
                  placeholder={field.key === 'region' ? 'Eine Zeile pro Eckpunkt: 48.20, 16.30' : field.key === 'notes' ? 'keine Notiz' : '— fehlt —'}
                  readOnly={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              ) : (
                <Input
                  tone={tone}
                  value={value === '—' ? '' : value}
                  // ANNAHME: leeres „Kunde verfügbar ab“ = ganztägig verfügbar (kein Datenfehler)
                  placeholder={field.key === 'customerAvailableFrom' ? 'ganztägig (keine Angabe)' : '— fehlt —'}
                  readOnly={!canEdit}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              )}
              {fieldIssues.map((i) => (
                <FieldMessage key={i.code} tone={i.severity === 'error' ? 'error' : 'warning'}>
                  {i.message}
                  {i.suggestion && canEdit && draft[field.key] !== i.suggestion && (
                    <button type="button" className="ml-2 font-semibold text-brand-700 underline hover:text-brand-800" onClick={() => setDraft({ ...draft, [field.key]: i.suggestion! })}>
                      „{i.suggestion}“ übernehmen
                    </button>
                  )}
                </FieldMessage>
              ))}
            </div>
          );
        })}

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
          {isOverridden && (
            <Button className="mr-auto" onClick={() => void resetToOriginal()} disabled={saving}>
              Original wiederherstellen
            </Button>
          )}
          <Button onClick={() => setDraft({})} disabled={!dirty}>
            Verwerfen
          </Button>
          <Button type="submit" variant="primary" disabled={!entityKey || !dirty || saving}>
            {saving ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </div>
      </Card>
    </Page>
  );
}
