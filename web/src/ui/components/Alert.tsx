/**
 * @file      Alert.tsx – UI-Baustein Alert
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import type { ReactNode } from 'react';
import { cx } from '../cx';

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

/** Hinweisbox. `size="sm"` für kurze Zeilen in Listen und Fußleisten. */
export function Alert({ tone, size = 'md', className, children, role }: { tone: Tone; size?: 'sm' | 'md'; className?: string; children: ReactNode; role?: string }) {
  return (
    <div role={role ?? (tone === 'danger' ? 'alert' : undefined)} className={cx('alert', `alert--${tone}`, size === 'sm' && 'alert--sm', className)}>
      {children}
    </div>
  );
}
