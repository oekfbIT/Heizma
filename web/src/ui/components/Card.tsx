/**
 * @file      Card.tsx – UI-Baustein Card
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

/** Weiße Fläche mit Rahmen und Schatten */
export function Card({ className, as: Tag = 'div', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'form' }) {
  return <Tag className={cx('card', className)} {...rest} />;
}
