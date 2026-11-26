import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore } from '@/core';
import { formatDay } from '@/lib/format';
import type { ServiceRequest, UnassignedRequest } from '@/lib/types';
import type { Escalation } from '@/modules';
import { Alert, Icon } from '@/ui';
import EscalationDialog from './EscalationDialog';

interface Props {
  items: UnassignedRequest[];
  requests: ServiceRequest[];
  escalations: Record<string, Escalation>;
  nextWorkday: string;
}

/** Je Grund genau eine nächste Aktion */
function actionFor(reason: string): { kind: 'fix' | 'customer' | 'internal'; label: string } {
  if (reason.startsWith('Keine Koordinaten')) return { kind: 'fix', label: 'Korrigieren' };
  if (reason.startsWith('Kapazität')) return { kind: 'customer', label: 'Kunde informieren' };
  return { kind: 'internal', label: 'Eskalieren' };
}

const ORDER = ['Kapazität', 'Keine Koordinaten', 'Zuständige', 'Nicht zuordenbar'];

/** Nicht eingeplante Anfragen – gruppiert nach Grund, mit Aktion pro Eintrag */
export default function Waitlist({ items, requests, escalations, nextWorkday }: Props) {
  const core = useCore();
  const [open, setOpen] = useState(true);
  const [dialog, setDialog] = useState<{ request: ServiceRequest; reason: string; type: Escalation['type'] } | null>(null);
  if (!items.length) {
    return (
      <Alert tone="success" className="font-medium">
        ✓ Alle Anfragen dieser Auswahl sind eingeplant
      </Alert>
    );
  }
  const byId = new Map(requests.map((r) => [r.id, r]));
  const groups = Object.entries(
    items.reduce<Record<string, UnassignedRequest[]>>((acc, item) => {
      (acc[item.reason] ??= []).push(item);
      return acc;
    }, {}),
  ).sort(([a], [b]) => ORDER.findIndex((o) => a.startsWith(o)) - ORDER.findIndex((o) => b.startsWith(o)));
  const handled = items.filter((i) => escalations[i.requestId]).length;

  return (
    <div className="rounded-xl border border-warning-200 bg-warning-50/60">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="text-sm font-semibold text-warning-900">Nicht eingeplant</span>
          <span className="ml-2 rounded-full bg-warning-200/70 px-2 py-0.5 text-xs font-semibold text-warning-900">{items.length}</span>
          <span className="block text-xs text-warning-800/80">
            {handled} von {items.length} bearbeitet · ältere Anfragen haben Vorrang
          </span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-warning-700 transition ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-warning-200 px-3 py-3">
          {groups.map(([reason, list]) => {
            const action = actionFor(reason);
            return (
              <div key={reason}>
                <p className="px-1 text-xs font-semibold uppercase tracking-wider text-warning-800">
                  {reason} · {list.length}
                </p>
                <ul className="mt-1 space-y-1">
                  {list.map((item) => {
                    const r = byId.get(item.requestId);
                    if (!r) return null;
                    const esc = escalations[item.requestId];
                    return (
                      <li key={item.requestId} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2.5 text-xs shadow-sm">
                        <Link to={`/stammdaten/anfragen/${item.requestId}`} className="min-w-0 flex-1 hover:text-brand-600">
                          <span className="block truncate font-medium">{r.address}</span>
                          <span className="block truncate text-gray-400">
                            {item.requestId} · {core.anfragen.getAge(item.requestId)}
                          </span>
                        </Link>
                        {esc ? (
                          <button
                            title="Rückgängig"
                            onClick={() => void core.withdrawRequestEscalation(item.requestId)}
                            className="shrink-0 rounded-md bg-brand-50 px-2 py-1 font-medium text-brand-700"
                          >
                            ✓ {esc.type === 'customer_delay' ? `informiert · ${formatDay(esc.newDate!)}` : 'eskaliert'}
                          </button>
                        ) : action.kind === 'fix' ? (
                          <Link to={`/stammdaten/anfragen/${item.requestId}`} className="shrink-0 rounded-md border border-gray-200 px-2 py-1 font-medium hover:border-brand-400">
                            {action.label}
                          </Link>
                        ) : (
                          <button
                            onClick={() => setDialog({ request: r, reason, type: action.kind === 'customer' ? 'customer_delay' : 'internal' })}
                            className={`shrink-0 rounded-md px-2 py-1 font-medium ${
                              action.kind === 'customer' ? 'bg-brand-500 text-white hover:bg-brand-600' : 'border border-gray-200 hover:border-brand-400'
                            }`}
                          >
                            {action.label}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <EscalationDialog
          {...dialog}
          suggestedDate={nextWorkday}
          onClose={() => setDialog(null)}
          onDone={() => setDialog(null)}
        />
      )}
    </div>
  );
}
