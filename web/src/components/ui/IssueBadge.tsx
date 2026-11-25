import type { Issue, Severity } from '@/lib/types';
import { SEVERITY_LABEL, worstSeverity } from '@/lib/format';

const STYLE: Record<Severity, string> = {
  error: 'bg-red-50 text-red-700 ring-red-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export function SeverityPill({ severity, children }: { severity: Severity; children?: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLE[severity]}`}>
      {children ?? SEVERITY_LABEL[severity]}
    </span>
  );
}

/** Status-Spalte in Listen: OK oder schlimmster Befund + Anzahl */
export default function IssueBadge({ issues }: { issues: Issue[] }) {
  const relevant = issues.filter((i) => i.severity !== 'info');
  const worst = worstSeverity(relevant);
  if (!worst) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
        ✓ OK
      </span>
    );
  }
  return (
    <SeverityPill severity={worst}>
      {relevant.length} {relevant.length === 1 ? SEVERITY_LABEL[worst] : worst === 'error' ? 'Fehler' : 'Warnungen'}
    </SeverityPill>
  );
}
