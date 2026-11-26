/**
 * @file      Modal.tsx – UI-Baustein Modal
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import { useEffect, type ReactNode } from 'react';
import { cx } from '../cx';

interface ModalProps {
  onClose: () => void;
  /** Kleine Zeile über dem Titel, z. B. „An: Vertrieb“ */
  eyebrow?: ReactNode;
  title?: ReactNode;
  footer?: ReactNode;
  /** false = Inhalt bringt eigenes Padding mit (z. B. Kopfzeile mit Trennlinie) */
  padded?: boolean;
  className?: string;
  children: ReactNode;
}

/** Dialog: auf Mobil als Bottom-Sheet, ab sm zentriert. Schließt mit Escape und Klick daneben. */
export function Modal({ onClose, eyebrow, title, footer, padded = true, className, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal className={cx('modal-panel', padded && 'modal-panel--padded', className)} onClick={(e) => e.stopPropagation()}>
        {eyebrow && <p className="modal-eyebrow">{eyebrow}</p>}
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
