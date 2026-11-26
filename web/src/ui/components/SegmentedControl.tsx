/**
 * @file      SegmentedControl.tsx – UI-Baustein SegmentedControl
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import { cx } from '../cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Umschalter mit wenigen, sich ausschließenden Optionen */
export function SegmentedControl<T extends string>({ options, value, onChange }: { options: SegmentOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)} className={cx('segmented-item', o.value === value && 'segmented-item--active')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
