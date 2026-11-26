import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '../cx';

export type FieldTone = 'error' | 'warning' | undefined;

const inputClass = (tone: FieldTone, size: 'sm' | 'md' | undefined, readOnly: boolean | undefined, className?: string) =>
  cx('input', tone && `input--${tone}`, size === 'sm' && 'input--sm', readOnly && 'input--readonly', className);

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & { tone?: FieldTone; size?: 'sm' | 'md' };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ tone, size, className, readOnly, ...rest }, ref) {
  return <input ref={ref} readOnly={readOnly} className={inputClass(tone, size, readOnly, className)} {...rest} />;
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { tone?: FieldTone };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ tone, className, readOnly, ...rest }, ref) {
  return <textarea ref={ref} readOnly={readOnly} className={inputClass(tone, 'md', readOnly, className)} {...rest} />;
});

/** Beschriftung + Feld + Hinweis. `label` darf Badges enthalten. */
export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** Meldung unter einem Feld (Fehler rot, Warnung gelb) */
export function FieldMessage({ tone, children }: { tone: 'error' | 'warning'; children: ReactNode }) {
  return <span className={`field-message--${tone}`}>{children}</span>;
}
