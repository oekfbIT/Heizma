/**
 * @file      PolygonEditor.tsx – Editor für Einsatzgebiete (Eckpunkte „lat, lng“)
 * @layer     Web · View-Komponente (Stammdaten)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
import { useMemo } from 'react';
import type { Stammdaten } from '@/modules';
import { nearestPlace, placeIndex } from '@/lib/placeLabel';

interface Point { lat: string; lng: string }

/** Text "lat, lng\n…" ⇄ Liste von Eckpunkten. Gespeichert wird weiterhin der Text. */
const parse = (text: string): Point[] =>
  text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [lat = '', lng = ''] = l.split(',').map((s) => s.trim());
      return { lat, lng };
    });
const serialize = (pts: Point[]) => pts.map((p) => `${p.lat}, ${p.lng}`).join('\n');

const valid = (p: Point) => {
  const lat = Number(p.lat), lng = Number(p.lng);
  return p.lat !== '' && p.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
};

export default function PolygonEditor({
  value, onChange, readOnly, data, className = '',
}: { value: string; onChange: (v: string) => void; readOnly?: boolean; data?: Stammdaten; className?: string }) {
  const points = parse(value);
  const places = useMemo(() => placeIndex(data), [data]);
  const set = (pts: Point[]) => onChange(serialize(pts));
  const update = (i: number, patch: Partial<Point>) => set(points.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  return (
    <div className="space-y-2">
      {points.length === 0 && <div className="input input--readonly text-gray-400">— kein Einsatzgebiet —</div>}
      {points.map((p, i) => {
        const ok = valid(p);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-right text-xs tabular-nums text-gray-400">{i + 1}</span>
            <div className={`input flex flex-1 items-center gap-2 ${ok ? '' : 'input--error'} ${className}`}>
              <input
                className="w-24 bg-transparent tabular-nums outline-none"
                value={p.lat} placeholder="lat" inputMode="decimal" readOnly={readOnly}
                onChange={(e) => update(i, { lat: e.target.value })}
              />
              <span className="text-gray-300">,</span>
              <input
                className="w-24 bg-transparent tabular-nums outline-none"
                value={p.lng} placeholder="lng" inputMode="decimal" readOnly={readOnly}
                onChange={(e) => update(i, { lng: e.target.value })}
              />
              <span className="ml-auto truncate text-sm text-gray-500">
                {ok ? nearestPlace(Number(p.lat), Number(p.lng), places) : 'ungültig'}
              </span>
            </div>
            {!readOnly && (
              <button
                type="button" title="Eckpunkt entfernen"
                className="rounded-lg p-2 text-gray-400 hover:bg-danger-50 hover:text-danger-600"
                onClick={() => set(points.filter((_, j) => j !== i))}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6" />
                </svg>
              </button>
            )}
          </div>
        );
      })}
      <div className="flex items-center justify-between pl-8">
        {!readOnly ? (
          <button type="button" className="btn btn--secondary" onClick={() => set([...points, { lat: '', lng: '' }])}>
            + Eckpunkt hinzufügen
          </button>
        ) : <span />}
        {points.length > 0 && points.length < 3 && <span className="text-xs text-warning-600">Mindestens 3 Eckpunkte für ein Gebiet</span>}
      </div>
    </div>
  );
}
