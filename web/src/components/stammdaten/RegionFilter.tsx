/**
 * @file      RegionFilter.tsx – Chip-Filter nach Einsatzgebiet
 * @layer     Web · View-Komponente (Stammdaten)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import type { Technician } from '@/lib/types';
import { NO_REGION, regionLabel } from '@/lib/regions';

interface Props {
  technicians: Technician[];
  value: string;
  onChange: (value: string) => void;
  colors?: Record<string, string>;
  counts?: Record<string, number>; // Anzahl je Region (optional)
  showUnassigned?: boolean;
  compact?: boolean;
}

/** Chip-Leiste zum Filtern nach Einsatzgebiet */
export default function RegionFilter({ technicians, value, onChange, colors, counts, showUnassigned = true, compact }: Props) {
  const chip = (key: string, label: string, color?: string) => {
    const active = value === key;
    return (
      <button
        key={key || 'all'}
        onClick={() => onChange(active && key ? '' : key)}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium transition ${
          compact ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm'
        } ${active ? 'border-ink bg-ink text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}
      >
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
        {counts && key in counts && <span className={active ? 'text-white/70' : 'text-gray-400'}>{counts[key]}</span>}
      </button>
    );
  };
  return (
    <div className={`flex gap-1.5 ${compact ? 'overflow-x-auto pb-1' : 'flex-wrap'}`}>
      {chip('', 'Alle Regionen')}
      {technicians.map((t) => chip(t.id, regionLabel(t), colors?.[t.id]))}
      {showUnassigned && chip(NO_REGION, 'Ohne Zuständigkeit')}
    </div>
  );
}
