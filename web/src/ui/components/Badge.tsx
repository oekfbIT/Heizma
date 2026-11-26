import type { ReactNode } from 'react';
import { cx } from '../cx';

export type BadgeTone =
  | 'success'
  | 'solid'
  | 'danger'
  | 'danger-soft'
  | 'warning'
  | 'warning-soft'
  | 'info'
  | 'info-soft'
  | 'neutral'
  | 'accent';

/** Kleines Status-Label. `strong` für Status-Chips (fetter, etwas breiter). */
export function Badge({ tone, strong, title, className, children }: { tone: BadgeTone; strong?: boolean; title?: string; className?: string; children: ReactNode }) {
  return (
    <span title={title} className={cx('badge', `badge--${tone}`, strong && 'badge--strong', className)}>
      {children}
    </span>
  );
}
