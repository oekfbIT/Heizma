import { useState } from 'react';
import EscalationDialog from '@/components/planner/EscalationDialog';
import { apiGet } from '@/lib/api';
import type { ServiceRequest } from '@/lib/types';

interface GeoResult { lat: number; lng: number; address: string; source: 'google' | 'osm'; precision: 'exact' | 'street' | 'town' }

const has = (v?: string) => !!v && v.trim() !== '' && v.trim() !== '—';

/**
 * Hilft bei unvollständigen Standortdaten einer Anfrage:
 * Adresse → Koordinaten, Koordinaten → Adresse, sonst Eskalation an den Vertrieb.
 * Ergebnisse landen nur im Entwurf – gespeichert wird erst mit "Speichern".
 */
export default function LocationAssist({
  request, address, lat, lng, onFill, escalated, onEscalated,
}: {
  request: ServiceRequest;
  address: string; lat: string; lng: string;
  onFill: (patch: Record<string, string>) => void;
  escalated: boolean;
  onEscalated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);
  const [dialog, setDialog] = useState(false);
  const [approx, setApprox] = useState(false);

  const hasAddress = has(address);
  const hasCoords = has(lat) && has(lng);
  if (hasAddress && hasCoords && !found) return null;

  const mode = hasAddress && !hasCoords ? 'forward' : !hasAddress && hasCoords ? 'reverse' : hasAddress ? null : 'none';

  async function lookup() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'forward') {
        const r = await apiGet<GeoResult>(`/api/geocode?address=${encodeURIComponent(address)}`);
        onFill({ lat: String(+r.lat.toFixed(5)), lng: String(+r.lng.toFixed(5)) });
        const note =
          r.precision === 'exact' ? '' : r.precision === 'street' ? ' Hausnummer nicht gefunden – Straßenmitte verwendet.' : ' Nur der Ort wurde gefunden – Ortsmitte verwendet, für die Planung meist ausreichend.';
        setFound(`Gefunden: ${r.address} (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}).${note} Bitte prüfen und speichern.`);
        setApprox(r.precision !== 'exact');
      } else {
        const r = await apiGet<GeoResult>(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
        onFill({ address: r.address });
        setFound(`Gefunden: ${r.address} – bitte prüfen und speichern.`);
      }
    } catch (e) {
      setError((e as Error).message || 'Nicht gefunden');
    } finally {
      setBusy(false);
    }
  }

  const reason =
    mode === 'none'
      ? 'Weder Adresse noch Koordinaten vorhanden – Standort unbekannt.'
      : mode === 'forward'
        ? `Adresse „${address}" konnte nicht gefunden werden – vermutlich Tippfehler.`
        : `Zu den Koordinaten ${lat}, ${lng} wurde keine Adresse gefunden.`;

  const escalateBox = (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm">
        {mode === 'none'
          ? 'Kein Standort vorhanden – hier kann nichts automatisch ergänzt werden. Bitte beim Vertrieb nachfragen.'
          : 'Automatisch nicht auffindbar. Der Vertrieb sollte die Adresse mit der Kund:in klären.'}
      </p>
      {escalated ? (
        <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">An Vertrieb eskaliert</span>
      ) : (
        <button type="button" className="btn-secondary" onClick={() => setDialog(true)}>An Vertrieb eskalieren</button>
      )}
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-amber-900">
      {found ? (
        <div className="space-y-2">
          <p className={`text-sm ${approx ? 'text-amber-800' : 'text-brand-800'}`}>{approx ? '≈' : '✓'} {found}</p>
          {approx && !escalated && (
            <button type="button" className="btn-secondary text-sm" onClick={() => setDialog(true)}>Genaue Adresse beim Vertrieb anfragen</button>
          )}
        </div>
      ) : mode === 'none' || error ? (
        <>
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          {escalateBox}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm">
            {mode === 'forward' ? 'Koordinaten fehlen – wir können sie aus der Adresse ermitteln.' : 'Adresse fehlt – wir können sie aus den Koordinaten ermitteln.'}
          </p>
          <button type="button" className="btn-primary" disabled={busy} onClick={() => void lookup()}>
            {busy ? 'Suche …' : mode === 'forward' ? 'Koordinaten finden' : 'Adresse finden'}
          </button>
        </div>
      )}
      {dialog && (
        <EscalationDialog
          request={{ ...request, address: hasAddress ? address : 'Adresse unbekannt' }}
          reason={reason}
          type="internal"
          suggestedDate=""
          onClose={() => setDialog(false)}
          onDone={() => { setDialog(false); onEscalated(); }}
        />
      )}
    </div>
  );
}
