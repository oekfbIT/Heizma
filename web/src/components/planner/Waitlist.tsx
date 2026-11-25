import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '@/components/ui/Icon';
import type { ServiceRequest, UnassignedRequest } from '@/lib/types';

/** Anfragen, die der Planer nicht unterbringen konnte – gruppiert nach Grund */
export default function Waitlist({ items, requests }: { items: UnassignedRequest[]; requests: ServiceRequest[] }) {
  const [open, setOpen] = useState(false);
  const byId = new Map(requests.map((r) => [r.id, r]));
  const groups = items.reduce<Record<string, UnassignedRequest[]>>((acc, item) => {
    (acc[item.reason] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="text-sm font-semibold text-amber-900">Warteliste</span>
          <span className="ml-2 rounded-full bg-amber-200/70 px-2 py-0.5 text-xs font-semibold text-amber-900">{items.length}</span>
          <span className="block text-xs text-amber-800/80">Nicht eingeplant – ältere Anfragen haben Vorrang</span>
        </span>
        <Icon name="chevron" className={`h-4 w-4 text-amber-700 transition ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="max-h-72 space-y-3 overflow-y-auto border-t border-amber-200 px-4 py-3">
          {Object.entries(groups).map(([reason, list]) => (
            <div key={reason}>
              <p className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                {reason} · {list.length}
              </p>
              <ul className="mt-1 space-y-1">
                {list.map((item) => {
                  const r = byId.get(item.requestId);
                  return (
                    <li key={item.requestId}>
                      <Link to={`/stammdaten/anfragen/${item.requestId}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-white">
                        <span className="truncate">
                          <span className="font-mono text-gray-500">{item.requestId}</span> · {r?.address ?? '—'}
                        </span>
                        <Icon name="chevron" className="h-3 w-3 shrink-0 text-gray-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
