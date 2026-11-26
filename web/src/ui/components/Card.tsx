import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

/** Weiße Fläche mit Rahmen und Schatten */
export function Card({ className, as: Tag = 'div', ...rest }: HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'form' }) {
  return <Tag className={cx('card', className)} {...rest} />;
}
