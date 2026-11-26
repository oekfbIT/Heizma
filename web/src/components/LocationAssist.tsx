/**
 * @file      LocationAssist.tsx – DATEN: Hilfe bei fehlenden/falschen Koordinaten – Geocoding, Reverse-Geocoding, Eskalation
 * @layer     Web · View-Komponente
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { useState } from 'react';
import EscalationDialog from '@/components/planner/EscalationDialog';
import { useCore } from '@/core';
import type { ServiceRequest } from '@/lib/types';
import { Badge, Button } from '@/ui';

const has = (v?: string) => !!v && v.trim() !== '' && v.trim() !== '—';

/**
 * Hilft bei unvollständigen Standortdaten einer Anfrage:
 * Adresse → Koordinaten, Koordinaten → Adresse, sonst Eskalation an den Vertrieb.
 * Ergebnisse landen nur im Entwurf – gespeichert wird erst mit "Speichern".
 */
export default function LocationAssist({
  request, address, lat, lng, onFill, escalated,
}: {
  request: ServiceRequest;
  address: string; lat: string; lng: string;
  onFill: (patch: Record<string, string>) => void;
  escalated: boolean;
}) {
  const { anfragen } = useCore();
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
        const r = await anfragen.geocode(address);
        onFill({ lat: String(+r.lat.toFixed(5)), lng: String(+r.lng.toFixed(5)) });
        const note =
          r.precision === 'exact' ? '' : r.precision === 'street' ? ' Hausnummer nicht gefunden – Straßenmitte verwendet.' : ' Nur der Ort wurde gefunden – Ortsmitte verwendet, für die Planung meist ausreichend.';
        setFound(`Gefunden: ${r.address} (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}).${note} Bitte prüfen und speichern.`);
        setApprox(r.precision !== 'exact');
      } else {
        const r = await anfragen.reverseGeocode(lat, lng);
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
        ? `Adresse „${address}“ konnte nicht gefunden werden – vermutlich Tippfehler.`
        : `Zu den Koordinaten ${lat}, ${lng} wurde keine Adresse gefunden.`;

  const escalateBox = (
    <div className="flex flex-wrap items-center gap-3">
      <p className="flex-1 text-sm">
        {mode === 'none'
          ? 'Kein Standort vorhanden – hier kann nichts automatisch ergänzt werden. Bitte beim Vertrieb nachfragen.'
          : 'Automatisch nicht auffindbar. Der Vertrieb sollte die Adresse mit dem Kunden klären.'}
      </p>
      {escalated ? (
        <Badge tone="warning" className="px-2.5 py-1">An den Vertrieb eskaliert</Badge>
      ) : (
        <Button onClick={() => setDialog(true)}>An den Vertrieb eskalieren</Button>
      )}
    </div>
  );

  return (
    <div className="mt-4 rounded-xl border border-warning-200 bg-warning-50/60 px-4 py-3 text-warning-900">
      {found ? (
        <div className="space-y-2">
          <p className={`text-sm ${approx ? 'text-warning-800' : 'text-brand-800'}`}>{approx ? '≈' : '✓'} {found}</p>
          {approx && !escalated && (
            <Button onClick={() => setDialog(true)}>Genaue Adresse beim Vertrieb anfragen</Button>
          )}
        </div>
      ) : mode === 'none' || error ? (
        <>
          {error && <p className="mb-2 text-sm text-danger-600">{error}</p>}
          {escalateBox}
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1 text-sm">
            {mode === 'forward' ? 'Koordinaten fehlen – wir können sie aus der Adresse ermitteln.' : 'Adresse fehlt – wir können sie aus den Koordinaten ermitteln.'}
          </p>
          <Button variant="primary" disabled={busy} onClick={() => void lookup()}>
            {busy ? 'Wird gesucht …' : mode === 'forward' ? 'Koordinaten finden' : 'Adresse finden'}
          </Button>
        </div>
      )}
      {dialog && (
        <EscalationDialog
          request={{ ...request, address: hasAddress ? address : 'Adresse unbekannt' }}
          reason={reason}
          type="internal"
          suggestedDate=""
          onClose={() => setDialog(false)}
          onDone={() => setDialog(false)}
        />
      )}
    </div>
  );
}
