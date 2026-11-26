/**
 * @file      SettingsMenu.tsx – Einstellungen: Protokoll, Demo zurücksetzen, Abmelden
 * @layer     Web · View-Komponente
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '@/core';
import { useAuth } from '@/core/auth';
import { Button, Icon, cx } from '@/ui';

/**
 * Einstellungen (Zahnrad) statt „Abmelden“: Protokoll, Demo zurücksetzen und Abmelden.
 * „Demo zurücksetzen“ löscht alle lokalen Korrekturen, Freigaben, Eingriffe, Eskalationen
 * und das Protokoll – zurück auf den Ausgangsstand der Heizma-API, z. B. für einen neuen Testlauf.
 */
export default function SettingsMenu({ variant = 'popover', onDone }: { variant?: 'popover' | 'inline'; onDone?: () => void }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  if (variant === 'inline') return <MenuContent onDone={onDone} logout={logout} email={user.email} expiresAt={user.expiresAt} />;

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="Einstellungen"
        aria-expanded={open}
        title="Einstellungen"
        className={cx('rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-brand-600', open && 'bg-gray-100 text-brand-600')}
      >
        <Icon name="settings" className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-header mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <MenuContent onDone={() => setOpen(false)} logout={logout} email={user.email} expiresAt={user.expiresAt} />
        </div>
      )}
    </div>
  );
}

function MenuContent({ email, expiresAt, logout, onDone }: { email: string; expiresAt: string | number; logout: () => void; onDone?: () => void }) {
  const core = useCore();
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const until = new Date(expiresAt).toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });

  async function reset() {
    setState('busy');
    try {
      await core.resetDemo();
      setState('done');
      setConfirm(false);
    } catch {
      setState('error');
    }
  }

  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-ink transition hover:bg-gray-50';

  return (
    <div className="space-y-1">
      <div className="px-3 pb-2 pt-1">
        <p className="truncate text-sm font-medium text-ink">{email}</p>
        <p className="text-xs text-gray-500">Sitzung bis {until}</p>
      </div>
      <div className="border-t border-gray-100" />

      <Link to="/protokoll" className={item} onClick={onDone}>
        <Icon name="list" className="h-4 w-4 text-gray-400" />
        Aktivitätsprotokoll
      </Link>

      {!confirm ? (
        <button type="button" className={item} onClick={() => { setConfirm(true); setState('idle'); }}>
          <Icon name="reset" className="h-4 w-4 text-gray-400" />
          <span className="flex-1">Demo zurücksetzen</span>
          {state === 'done' && <span className="text-xs font-medium text-brand-600">✓ zurückgesetzt</span>}
        </button>
      ) : (
        <div className="rounded-lg bg-warning-50 p-3 text-sm">
          <p className="font-medium text-warning-800">Alles auf den Ausgangsstand?</p>
          <p className="mt-1 text-xs text-warning-800">
            Löscht alle lokalen Korrekturen, Freigaben, Eingriffe, Eskalationen und das Protokoll. Die Routenplanung startet neu mit den Originaldaten der
            Heizma-API.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" onClick={() => setConfirm(false)} disabled={state === 'busy'}>
              Abbrechen
            </Button>
            <Button size="sm" variant="warning" onClick={() => void reset()} disabled={state === 'busy'}>
              {state === 'busy' ? 'Wird zurückgesetzt …' : 'Zurücksetzen'}
            </Button>
          </div>
          {state === 'error' && <p className="mt-2 text-xs text-danger-700">Zurücksetzen fehlgeschlagen – bitte erneut versuchen.</p>}
        </div>
      )}

      <div className="border-t border-gray-100" />
      <button type="button" className={item} onClick={logout}>
        <Icon name="logout" className="h-4 w-4 text-gray-400" />
        Abmelden
      </button>
    </div>
  );
}
