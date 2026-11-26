/**
 * @file      StopDetailsModal.tsx – Dialog mit allen Infos zu einem Stopp inkl. Planungs-Karte
 * @layer     Web · View-Komponente (Planer)
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import type { NoteInfo } from '@/modules';
import { Alert, Button, Modal } from '@/ui';
import RequestPlanningCard from '@/components/RequestPlanningCard';
import { formatDateTime, formatDay, visitationLabel } from '@/lib/format';
import type { Appointment, DayRoute, PlannedStop, ServiceRequest, Technician } from '@/lib/types';

interface Props {
  stop: PlannedStop;
  index: number;
  route: DayRoute;
  technician: Technician;
  color: string;
  request?: ServiceRequest;
  appointment?: Appointment;
  notes?: NoteInfo;
  violations: string[];
  onConfirmNote: (requestId: string, c: { earliest?: string; latest?: string } | null) => void;
  /** Planer hat die Anfrage verschoben / fixiert / herausgenommen → Plan neu laden */
  onPlanChanged?: () => void;
  onClose: () => void;
}

/** Alle Informationen zu einem Stopp in einem Dialog */
export default function StopDetailsModal({ stop, index, route, technician, color, request, appointment, notes, violations, onConfirmNote, onPlanChanged, onClose }: Props) {
  const insight = notes?.insights.find((i) => i.requestId === stop.id);
  const confirmed = notes?.confirmed[stop.id];
  const constraint = insight && (insight.earliest || insight.latest) ? { earliest: insight.earliest, latest: insight.latest } : null;
  const constraintLabel = constraint ? [constraint.earliest && `ab ${constraint.earliest}`, constraint.latest && `bis ${constraint.latest}`].filter(Boolean).join(' ') : '';
  const prev = index === 0 ? technician.home.label : route.stops[index - 1].customer;

  return (
    <Modal onClose={onClose} padded={false} className="max-h-[90vh] rounded-t-2xl border-0 shadow-2xl sm:rounded-2xl">
        {/* Kopf */}
        <div className="flex items-start gap-3 border-b border-gray-100 p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ background: stop.fixed ? 'rgb(var(--color-ink))' : color }}>
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{stop.customer}</h2>
            <p className="text-sm text-gray-500">{stop.address}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded bg-gray-100 px-2 py-0.5 font-medium text-gray-700">{stop.appointmentType}{stop.fixed ? ' · fixer Termin' : ' · neue Anfrage'}</span>
              {(stop.appointmentType === 'Besichtigung' || stop.visitationType) && (
                <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{visitationLabel(stop.visitationType)}</span>
              )}
              {route.approved && <span className="rounded bg-brand-500 px-2 py-0.5 font-medium text-white">Freigegeben</span>}
            </div>
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5 text-sm">
          {stop.kind === 'request' && (
            <Section title="Planung – Entscheidung des Planers">
              <RequestPlanningCard requestId={stop.id} compact onChanged={onPlanChanged} />
            </Section>
          )}

          {violations.length > 0 && (
            <Alert tone="danger" className="rounded-lg border-0 p-3">
              <p className="font-semibold">Regelverstoß</p>
              {violations.map((v) => (
                <p key={v} className="text-xs">
                  {v}
                </p>
              ))}
            </Alert>
          )}

          <Section title="Zeitplan">
            <Row label="Tag">{formatDay(route.date)} · {technician.name}</Row>
            <Row label="Termin">
              <strong className="tabular-nums">
                {stop.start}–{stop.end}
              </strong>
            </Row>
            <Row label="Anfahrt">
              von {prev} · {stop.travelEstimated ? 'ca. ' : ''}
              {stop.travelMinutes} min {stop.travelEstimated && <span className="text-warning-600">(geschätzt)</span>}
            </Row>
            <Row label="Ankunft">{stop.arrival}</Row>
            {stop.waitMinutes > 0 && <Row label="Wartezeit">{stop.waitMinutes} min vor Ort</Row>}
            {request?.customerAvailableFrom && <Row label="Kunde ab">{request.customerAvailableFrom} Uhr (harte Grenze)</Row>}
          </Section>

          {request && (
            <Section title="Anfrage">
              <Row label="Nummer">{request.id}</Row>
              <Row label="Eingang">{formatDateTime(request.createdAt)}</Row>
              <Row label="Dauer vor Ort">
                {request.visitationType ? request.durationMinutes : 105} min{!request.visitationType && ' (Typ unbekannt → 105 min angenommen)'}
              </Row>
            </Section>
          )}

          {request?.notes && (
            <Section title="Notiz aus dem Vertrieb">
              <p className="rounded-lg bg-gray-50 p-3 italic text-gray-700">„{request.notes}“</p>
              {insight && (
                <div className="mt-2 rounded-lg border border-accent-200 bg-accent-50/50 p-3 text-xs">
                  <p className="text-accent-800">
                    <strong>{insight.source === 'ai' ? '✦ KI-Hinweis' : 'Erkannter Hinweis'}:</strong> {insight.hint}
                  </p>
                  {constraint && (
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-gray-600">
                        {confirmed ? `Wird als feste Regel geplant: ${constraintLabel}.` : `Als feste Regel übernehmen (${constraintLabel})? Der Plan wird danach neu berechnet.`}
                      </span>
                      <Button size="sm" variant={confirmed ? 'secondary' : 'accent'} className="shrink-0 px-3 py-1" onClick={() => onConfirmNote(stop.id, confirmed ? null : constraint)}>
                        {confirmed ? 'Zurücknehmen' : 'Übernehmen'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {appointment && (
            <Section title="Fixer Termin">
              <Row label="Nummer">{appointment.id}</Row>
              <Row label="Art">{appointment.type}</Row>
              <Row label="Hinweis">Nicht verschiebbar – die Route wird um diesen Termin herum geplant.</Row>
            </Section>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 p-4">
          <a className="btn btn--secondary flex-1" href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`} target="_blank" rel="noreferrer">
            In Google Maps öffnen
          </a>
          <Button variant="primary" className="flex-1" onClick={onClose}>
            Fertig
          </Button>
        </div>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 shrink-0 text-gray-500">{label}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}
