import { useState } from 'react';
import { apiSend, type Escalation } from '@/lib/api';
import { formatDay } from '@/lib/format';
import type { ServiceRequest } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = { WP: 'Wärmepumpe', PV: 'Photovoltaik', 'WP+PV': 'Wärmepumpe & Photovoltaik' };

const city = (address: string) => address.split(',').pop()?.trim() ?? address;

export function customerDelayText(r: ServiceRequest, date: string) {
  return `Guten Tag,

vielen Dank für Ihr Vertrauen in Heizma. Aufgrund der aktuell hohen Nachfrage können wir die Besichtigung für Ihre ${
    TYPE_LABEL[r.visitationType ?? ''] ?? 'Anlage'
  } in ${city(r.address)} leider nicht wie ursprünglich geplant durchführen.

Als neuen Termin schlagen wir Ihnen ${formatDay(date)} (${date.split('-').reverse().join('.')}) vor. Die genaue Uhrzeit bestätigen wir Ihnen am Vortag. Passt Ihnen der Tag nicht, antworten Sie einfach auf diese Nachricht.

Wir entschuldigen uns für die Verzögerung.

Freundliche Grüße
Ihr Heizma-Team`;
}

export function internalText(r: ServiceRequest, reason: string) {
  return `Anfrage ${r.id} (${r.customer}, ${r.address}) kann nicht eingeplant werden.

Grund: ${reason}

Bitte klären: zuständigen Techniker bzw. Verfügbarkeit festlegen oder Kund:in informieren.`;
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
  const [date, setDate] = useState(suggestedDate);
  const [message, setMessage] = useState(type === 'customer_delay' ? customerDelayText(request, suggestedDate) : internalText(request, reason));
  const [edited, setEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/escalations/${request.id}`, 'POST', {
        type,
        newDate: type === 'customer_delay' ? date : undefined,
        recipient: type === 'customer_delay' ? request.customer : 'Disposition / Vertrieb',
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
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={onClose}>
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {type === 'customer_delay' ? 'Kund:in über Verschiebung informieren' : 'Intern eskalieren'}
        </p>
        <h2 className="mt-1 text-lg font-semibold">
          {request.customer} · {city(request.address)}
        </h2>
        <p className="mt-1 text-sm text-gray-500">Grund: {reason}</p>

        {type === 'customer_delay' && (
          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium">Neuer Terminvorschlag</span>
            <input
              type="date"
              className="input"
              value={date}
              min={suggestedDate}
              onChange={(e) => {
                setDate(e.target.value);
                if (!edited && e.target.value) setMessage(customerDelayText(request, e.target.value));
              }}
            />
            <span className="mt-1 block text-xs text-gray-400">Vorschlag: erster Werktag nach der Planungswoche</span>
          </label>
        )}

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium">Nachricht</span>
          <textarea
            rows={9}
            className="input font-normal"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setEdited(true);
            }}
          />
        </label>

        <p className="mt-2 text-xs text-gray-400">Prototyp: Die Nachricht wird gespeichert und markiert, nicht versendet.</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving || (type === 'customer_delay' && !date)}>
            {saving ? 'Speichert …' : type === 'customer_delay' ? 'Als gesendet markieren' : 'Eskalieren'}
          </button>
        </div>
      </div>
    </div>
  );
}
