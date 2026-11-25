import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'success' | 'danger' | 'warning';
  progress?: number; // 0–1
  to?: string;
}

const TONE: Record<NonNullable<Props['tone']>, string> = {
  default: 'text-gray-500',
  success: 'text-brand-600',
  danger: 'text-red-600',
  warning: 'text-amber-600',
};

/** KPI-Kachel für die Kopfzeile der Übersicht */
export default function StatCard({ label, value, hint, tone = 'default', progress, to }: Props) {
  const content = (
    <div className="card h-full p-4 transition hover:border-gray-300 md:p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold md:text-3xl tracking-tight text-ink">{value}</p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {hint && <p className={`mt-2 text-xs font-medium md:text-sm ${TONE[tone]}`}>{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}
