/**
 * @file      Login.tsx – Seite: Mock-Login
 * @layer     Web · View (Seite)
 * @siehe     docs/09-setup.md · docs/10-code-navigation.md
 */
import { useState, type FormEvent } from 'react';
import logo from '@/assets/brand/heizma-logo.png';
import { Alert, Button, Field, Input } from '@/ui';
import { useAuth } from '@/core/auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={logo} alt="heizma" className="h-10 w-auto" />
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Routenoptimierung</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-ink">Anmelden</h1>
        <p className="mb-6 text-sm text-gray-500">Zugang für die Planung.</p>

        <Field label="E-Mail" className="mb-4">
          <Input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="py-2.5"
            placeholder="name@heizma.at"
          />
        </Field>

        <Field label="Passwort" className="mb-6">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="py-2.5"
          />
        </Field>

        {error && (
          <Alert tone="danger" className="mb-4 rounded-lg px-3 py-2">
            {error}
          </Alert>
        )}

        <Button type="submit" variant="primary" block icon="lock" disabled={busy} className="py-3 text-[15px] disabled:opacity-60">
          {busy ? 'Wird angemeldet …' : 'Anmelden'}
        </Button>

        <p className="mt-6 text-center text-xs text-gray-400">Sitzung läuft nach 2 Stunden automatisch ab.</p>
      </form>
    </div>
  );
}
