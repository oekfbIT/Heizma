import { useState, type FormEvent } from 'react';
import logo from '@/assets/brand/heizma-logo.png';
import Icon from '@/components/ui/Icon';
import { useAuth } from '@/lib/auth';

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
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Einsatzplanung</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-ink">Anmelden</h1>
        <p className="mb-6 text-sm text-gray-500">Zugang für die Disposition.</p>

        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium text-ink">E-Mail</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            placeholder="name@heizma.at"
          />
        </label>

        <label className="mb-6 block">
          <span className="mb-1 block text-sm font-medium text-ink">Passwort</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </label>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button type="submit" disabled={busy} className="btn-primary flex w-full items-center justify-center gap-2 py-3 text-[15px] disabled:opacity-60">
          <Icon name="lock" className="h-4 w-4" />
          {busy ? 'Wird angemeldet …' : 'Anmelden'}
        </button>

        <p className="mt-6 text-center text-xs text-gray-400">Sitzung läuft nach 2 Stunden automatisch ab.</p>
      </form>
    </div>
  );
}
