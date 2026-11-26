/**
 * @file      Modal.tsx – UI-Baustein Modal
 * @layer     Web · Design-System (Komponente)
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../cx';

/** Offene Dialoge (oberster zuletzt) – Escape schließt nur den obersten, damit Dialoge aus Dialogen heraus öffnen können */
const stack: symbol[] = [];

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

/**
 * Dialog: auf Mobil als Bottom-Sheet, ab sm zentriert. Schließt mit Escape und Klick daneben.
 * Wird per Portal an <body> gehängt – so kann ein Dialog einen weiteren öffnen (z. B. „Planung ändern“ im Stopp-Dialog).
 */
export function Modal({ onClose, eyebrow, title, footer, padded = true, className, children }: ModalProps) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const id = Symbol('modal');
    stack.push(id);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && stack[stack.length - 1] === id && close.current();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(id), 1);
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div role="dialog" aria-modal className={cx('modal-panel', padded && 'modal-panel--padded', className)} onClick={(e) => e.stopPropagation()}>
        {eyebrow && <p className="modal-eyebrow">{eyebrow}</p>}
        {title && <h2 className="modal-title">{title}</h2>}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
