import { useState } from 'react';
import { useCore } from '@/core';
import { formatDay } from '@/lib/format';
import type { ServiceRequest } from '@/lib/types';
import { cityOf as city, type Escalation } from '@/modules';
import { Button, Field, Input, Modal, Textarea } from '@/ui';

const TYPE_LABEL: Record<string, string> = { WP: 'Wärmepumpe', PV: 'Photovoltaikanlage', 'WP+PV': 'Wärmepumpe und Photovoltaikanlage' };

export function customerDelayText(r: ServiceRequest, date: string) {
  return `Guten Tag,

vielen Dank für Ihr Vertrauen in Heizma. Aufgrund der aktuell hohen Nachfrage können wir die Besichtigung für Ihre ${
    TYPE_LABEL[r.visitationType ?? ''] ?? 'Anlage'
  } in ${city(r.address)} leider nicht wie ursprünglich geplant durchführen.

Als neuen Termin schlagen wir Ihnen ${formatDay(date)} (${date.split('-').reverse().join('.')}) vor. Die genaue Uhrzeit bestätigen wir Ihnen am Vortag. Passt Ihnen der Tag nicht, antworten Sie einfach auf diese Nachricht.

Bitte entschuldigen Sie die Verzögerung.

Freundliche Grüße
Ihr Heizma-Team`;
}

export function internalText(r: ServiceRequest, reason: string) {
  return `Anfrage ${r.id} (${r.customer}, ${r.address}) kann nicht eingeplant werden.

Grund: ${reason}

Bitte klären: Zuständigkeit bzw. Verfügbarkeit festlegen oder den Kunden informieren.`;
}

interface Props {
  request: ServiceRequest;
  reason: string;
  type: Escalation['type'];
  suggestedDate: string;
  onClose: () => void;
  onDone: () => void;
}

/** Entwurf einer Benachrichtigung – wird gespeichert, nicht versendet (Case-Prototyp) */
export default function EscalationDialog({ request, reason, type, suggestedDate, onClose, onDone }: Props) {
  const core = useCore();
  const [date, setDate] = useState(suggestedDate);
  const [message, setMessage] = useState(type === 'customer_delay' ? customerDelayText(request, suggestedDate) : internalText(request, reason));
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await core.escalateRequest(request.id, {
        type,
        newDate: type === 'customer_delay' ? date : undefined,
        recipient: type === 'customer_delay' ? request.customer : 'Vertrieb / Planung',
        message,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      onClose={onClose}
      eyebrow={type === 'customer_delay' ? 'Kunden über die Verschiebung informieren' : 'Intern eskalieren'}
      title={`${request.customer} · ${city(request.address)}`}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving || (type === 'customer_delay' && !date)}>
            {saving ? 'Wird gespeichert …' : type === 'customer_delay' ? 'Als gesendet markieren' : 'Eskalieren'}
          </Button>
        </>
      }
    >
      <p className="mt-1 text-sm text-gray-500">Grund: {reason}</p>

      {type === 'customer_delay' && (
        <Field className="mt-4" label="Neuer Terminvorschlag" hint="Vorschlag: erster Werktag nach der Planungswoche">
          <Input
            type="date"
            value={date}
            min={suggestedDate}
            onChange={(e) => {
              setDate(e.target.value);
              if (!edited && e.target.value) setMessage(customerDelayText(request, e.target.value));
            }}
          />
        </Field>
      )}

      <Field className="mt-4" label="Nachricht">
        <Textarea
          rows={9}
          className="font-normal"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            setEdited(true);
          }}
        />
      </Field>

      <p className="mt-2 text-xs text-gray-400">Prototyp: Die Nachricht wird gespeichert und markiert, nicht versendet.</p>
      {error && <p className="mt-2 text-sm text-danger-600">{error}</p>}
    </Modal>
  );
}
