import { useState } from 'react';
import type { Plan } from '@/lib/types';

/** „✓ 0 Regelverstöße“ – Ergebnis der unabhängigen Plan-Prüfung, aufklappbar mit allen Regeln */
export default function VerificationBadge({ plan, onSelect }: { plan: Plan; onSelect?: (technicianId: string, date: string) => void }) {
  const [open, setOpen] = useState(false);
  const v = plan.verification;
  if (!v) return null;
  const checks = v.rules.reduce((n, r) => n + r.checks, 0);
  const exceptions = v.exceptions ?? [];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition ${
          v.ok ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : 'bg-red-50 text-red-700 hover:bg-red-100'
        }`}
      >
        {v.ok ? '✓ 0 Regelverstöße' : `⚠ ${v.totalViolations} Regelverstöße`}
        <span className="font-normal opacity-70">· {v.rules.length} Regeln</span>
        {exceptions.length > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-amber-800">{exceptions.length} Ausnahme{exceptions.length === 1 ? '' : 'n'}</span>}
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-[1000] w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white p-4 text-left shadow-xl">
          <p className="text-sm font-semibold">Unabhängige Plan-Prüfung</p>
          <p className="mb-3 text-xs text-gray-500">
            {checks} Einzelprüfungen gegen die Case-Regeln – getrennt vom Planer nachgerechnet, mit denselben Fahrzeiten.
          </p>
          <ul className="space-y-1.5">
            {v.rules.map((r) => (
              <li key={r.rule} className="text-xs">
                <div className="flex items-start gap-2">
                  <span className={r.violations.length ? 'text-red-600' : 'text-brand-600'}>{r.violations.length ? '✕' : '✓'}</span>
                  <span className="flex-1 text-gray-700">{r.label}</span>
                  <span className="tabular-nums text-gray-400">{r.checks}</span>
                </div>
                {r.violations.slice(0, 5).map((x, i) => (
                  <button
                    key={i}
                    onClick={() => x.technicianId && x.date && onSelect?.(x.technicianId, x.date)}
                    className="ml-5 block text-left text-[11px] text-red-600 hover:underline"
                  >
                    {x.date ? `${x.date} · ` : ''}
                    {x.message}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {exceptions.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              <p className="text-xs font-semibold text-amber-800">Bewusste Ausnahmen des Planers</p>
              {exceptions.map((e, i) => (
                <button
                  key={i}
                  onClick={() => e.technicianId && e.date && onSelect?.(e.technicianId, e.date)}
                  className="block text-left text-[11px] text-amber-700 hover:underline"
                >
                  ◆ {e.date ? `${e.date} · ` : ''}
                  {e.message} – „{e.reason}“
                </button>
              ))}
            </div>
          )}
          {v.notes.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
              {v.notes.map((n) => (
                <p key={n} className="text-[11px] text-gray-500">
                  ℹ {n}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
