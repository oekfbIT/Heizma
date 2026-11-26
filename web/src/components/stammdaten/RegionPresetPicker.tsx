/**
 * @file      RegionPresetPicker.tsx – DATEN: Schnelle Gebietszuweisung für Personen ohne Gebiet (tech_07)
 * @layer     Web · View-Komponente (Stammdaten)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { useMemo } from 'react';
import type { Technician } from '@/lib/types';
import { inPolygon, parseRegion, regionPresets, serializeRegion, type Stammdaten } from '@/modules';
import { Icon } from '@/ui';

interface Props {
  technician: Technician;
  data: Stammdaten;
  /** Aktueller Wert des Gebiets-Felds (Text, eine Zeile pro Eckpunkt) */
  value: string;
  onPick: (text: string) => void;
}

/**
 * Schnelle Gebietszuweisung, z. B. für Personen ohne Einsatzgebiet:
 * Vorlage wählen → Eckpunkte werden übernommen → Speichern → Prüfung und Routenplanung laufen neu.
 * Darunter eine Vorschau, wie viele Anfragen im gewählten Gebiet liegen.
 */
export default function RegionPresetPicker({ technician, data, value, onPick }: Props) {
  const presets = useMemo(() => regionPresets(technician, data.technicians), [technician, data.technicians]);
  const polygon = parseRegion(value);

  const preview = useMemo(() => {
    if (polygon.length < 3) return null;
    const inside = data.requests.filter((r) => r.lat != null && r.lng != null && inPolygon({ lat: r.lat, lng: r.lng }, polygon));
    const unassigned = inside.filter((r) => (data.responsibility?.[r.id] ?? []).length === 0);
    return { inside: inside.length, unassigned: unassigned.length };
  }, [value, data]);

  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-full sm:w-auto"
          value=""
          aria-label="Gebiet aus Vorlage übernehmen"
          onChange={(e) => {
            const preset = presets.find((p) => p.value === e.target.value);
            if (preset) onPick(serializeRegion(preset.polygon));
          }}
        >
          <option value="">Gebiet aus Vorlage übernehmen …</option>
          {presets.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-500">Danach speichern – die Routenplanung läuft sofort neu.</span>
      </div>
      {preview && (
        <p className="flex items-center gap-1.5 text-sm text-gray-600">
          <Icon name="inbox" className="h-4 w-4 text-gray-400" />
          Im Gebiet liegen <strong className="text-ink">{preview.inside}</strong> Anfragen
          {preview.unassigned > 0 && (
            <>
              , davon <strong className="text-brand-700">{preview.unassigned}</strong> bisher ohne zuständige Person
            </>
          )}
          .
        </p>
      )}
    </div>
  );
}
