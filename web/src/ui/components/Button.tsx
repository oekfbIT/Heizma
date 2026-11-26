/**
 * @file      Button.tsx – UI-Baustein Button
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../cx';
import Icon from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'warning' | 'accent' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
  /** Icon-Name aus ui/components/Icon */
  icon?: string;
  block?: boolean;
}

/** Einheitlicher Button. Varianten und Größen kommen aus components.css (.btn--*). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cx('btn', `btn--${variant}`, size === 'sm' && 'btn--sm', block && 'w-full', className)} {...rest}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
});

/** Quadratischer Icon-Button (z. B. Schließen, Neu laden) */
export function IconButton({ icon, label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cx('btn--icon', className)} {...rest}>
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}
