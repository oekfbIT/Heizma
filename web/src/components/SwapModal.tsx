/**
 * @file      SwapModal.tsx – Tausch-Dialog (REGEL-8): wer macht Platz für eine wartende Anfrage – mit Vorher/Nachher-Prüfung
 * @layer     Web · View-Komponente
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 */
import { useEffect, useState } from 'react';
import { useCore } from '@/core';
import { formatDay } from '@/lib/format';
import type { RequestPlanning, RoutePreview, SwapOption } from '@/lib/types';
import { Alert, Badge, Button, Input, Modal } from '@/ui';

/**
 * Vorziehen per Tausch: Das System zeigt, welche geplante Anfrage Platz machen könnte – nur regelkonforme Varianten,
 * nie fixe Termine oder freigegebene Touren. Empfehlung zuerst; der Planer kann jede andere wählen.
 * Links die Varianten, rechts die Vorschau der Tagesroute (vorher/nachher) inkl. Regelprüfung.
 */

const dur = (min: number) => `${Math.floor(min / 60)}:${String(Math.abs(min % 60)).padStart(2, '0')} h`;

/** Fahrzeit-Differenz mit Farbe und Klartext: weniger = gut (grün), mehr = Abweichung von der optimalen Route (orange) */
function DriveDelta({ delta, size = 'sm' }: { delta: number; size?: 'sm' | 'lg' }) {
  const cls = size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  if (delta < 0)
    return <span className={`inline-flex items-center gap-1 rounded-full bg-brand-50 font-semibold tabular-nums text-brand-700 ring-1 ring-brand-200 ${cls}`}>▼ {-delta} min weniger Fahrt</span>;
  if (delta > 0)
    return <span className={`inline-flex items-center gap-1 rounded-full bg-warning-50 font-semibold tabular-nums text-warning-800 ring-1 ring-warning-200 ${cls}`}>▲ {delta} min mehr Fahrt</span>;
  return <span className={`inline-flex items-center rounded-full bg-gray-100 font-medium text-gray-600 ${cls}`}>gleiche Fahrzeit</span>;
}

/** Vergleichszeile vorher → nachher; bei Fahrzeit/Dauer gilt: weniger ist besser */
function Compare({ label, before, after, delta }: { label: string; before: string; after: string; delta?: number }) {
  const tone = delta === undefined || delta === 0 ? 'text-gray-500' : delta < 0 ? 'text-brand-700' : 'text-warning-700';
  return (
    <tr className="border-t border-gray-100">
      <td className="py-1.5 pr-2 text-gray-500">{label}</td>
      <td className="py-1.5 pr-2 tabular-nums text-gray-500">{before}</td>
      <td className="py-1.5 pr-2 font-semibold tabular-nums text-gray-900">{after}</td>
      <td className={`py-1.5 text-right font-medium tabular-nums ${tone}`}>{delta === undefined ? '' : delta === 0 ? '±0' : delta > 0 ? `+${delta} min` : `−${-delta} min`}</td>
    </tr>
  );
}

function Timeline({ route, removed }: { route: RoutePreview; removed: SwapOption['displaced'] }) {
  return (
    <ol className="space-y-1 text-xs">
      <li className="flex gap-2 text-gray-500">
        <span className="w-20 shrink-0 tabular-nums">{route.departure}</span>
        <span>Abfahrt Wohnort</span>
      </li>
      {route.stops.map((s) => (
        <li key={s.id} className={`flex gap-2 rounded-md px-1.5 py-1 ${s.isNew ? 'bg-brand-50 ring-1 ring-brand-200' : ''}`}>
          <span className="w-[4.6rem] shrink-0 tabular-nums font-medium">
            {s.start}–{s.end}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{s.customer}</span>
            {s.isNew && <span className="ml-1 font-semibold text-brand-700">neu</span>}
            {s.kind === 'appointment' && <span className="ml-1 text-gray-500">🔒 fix</span>}
            <span className="block truncate text-gray-500">
              {s.address} · {s.travelMinutes} min Anfahrt
            </span>
          </span>
        </li>
      ))}
      {route.lunch && (
        <li className="flex gap-2 text-gray-500">
          <span className="w-20 shrink-0 tabular-nums">{route.lunch.start}–{route.lunch.end}</span>
          <span>Mittagspause</span>
        </li>
      )}
      <li className="flex gap-2 text-gray-500">
        <span className="w-20 shrink-0 tabular-nums">{route.returnHome}</span>
        <span>Heimkehr</span>
      </li>
      <li className="flex gap-2 text-gray-400 line-through">
        <span className="w-20 shrink-0 tabular-nums">{removed.start}–{removed.end}</span>
        <span>{removed.customer} (weicht)</span>
      </li>
    </ol>
  );
}

export default function SwapModal(p: {
  requestId: string;
  olderWaiting: number;
  timeWish?: RequestPlanning['timeWish'];
  onClose: () => void;
  onSwap: (o: SwapOption, reason: string) => Promise<void>;
  onPrioritize: (reason: string) => Promise<void>;
  onManual: () => void;
}) {
  const core = useCore();
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<SwapOption | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    core.anfragen
      .swapOptions(p.requestId)
      .then((o) => {
        setOptions(o);
        setPicked(o.find((x) => x.recommended) ?? o[0] ?? null);
      })
      .catch((e: Error) => setError(e.message));
  }, [core, p.requestId]);

  const reasonOk = reason.trim().length >= 3;
  const key = (o: SwapOption) => `${o.technicianId}@${o.date}@${o.displaced.id}`;
  const visible = options ? (showAll ? options : options.slice(0, 6)) : [];
  const broken = picked ? picked.checks.filter((c) => !c.ok) : [];
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      onClose={p.onClose}
      eyebrow="Vorziehen"
      title="Wer soll Platz machen?"
      className="sm:max-w-5xl"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-gray-500 sm:mr-auto">
            Lieber nicht tauschen?{' '}
            <button className="font-medium text-brand-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !reasonOk} title={reasonOk ? '' : 'Begründung nötig'} onClick={() => void run(() => p.onPrioritize(reason))}>
              Nur vorziehen
            </button>{' '}
            – wird eingeplant, sobald Platz frei wird.
          </p>
          <Button size="sm" onClick={p.onClose}>
            Abbrechen
          </Button>
          <Button variant={picked?.displacesOlder || (picked && picked.deltaDrive > 0) ? 'warning' : 'primary'} size="sm" disabled={busy || !picked || !reasonOk || broken.length > 0} onClick={() => picked && void run(() => p.onSwap(picked, reason))}>
            {picked ? `Tauschen: ${picked.displaced.customer} weicht` : 'Tauschen'}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-gray-600">
        Alle passenden Touren sind voll. Hier siehst du, wer stattdessen weichen könnte. Angeboten werden nur Tausche, die alle Regeln einhalten.
        Fixe Termine und freigegebene Touren bleiben unverändert.
        {p.olderWaiting > 0 && <span className="text-warning-700"> {p.olderWaiting} ältere Anfrage{p.olderWaiting === 1 ? ' wartet' : 'n warten'} noch.</span>}
      </p>

      {p.timeWish && (
        <div className="mt-3 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-900">
          <strong>🕘 Kundenwunsch: {p.timeWish.hint}</strong>
          {p.timeWish.status === 'verworfen' ? ' – vom Planer verworfen, wird ignoriert.' : ' – alle Varianten halten ihn ein.'}
          <span className="block text-xs text-info-700">Notiz: „{p.timeWish.note}“</span>
        </div>
      )}

      {error && <Alert tone="danger" size="sm" className="mt-3">{error}</Alert>}
      {!options && !error && <p className="mt-4 text-sm text-gray-400">Tausch-Varianten werden berechnet …</p>}

      {options && options.length === 0 && (
        <Alert tone="warning" size="sm" className="mt-3">
          Kein Tausch hält alle Regeln ein. Du kannst die Anfrage trotzdem manuell als bewusste Ausnahme einplanen.
          <Button size="sm" className="mt-2" onClick={p.onManual}>
            Manuell einplanen …
          </Button>
        </Alert>
      )}

      {options && options.length > 0 && (
        <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* Varianten */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{options.length} Varianten · Empfehlung zuerst</p>
            <ul className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
              {visible.map((o) => {
                const sel = picked && key(picked) === key(o);
                return (
                  <li key={key(o)}>
                    <button
                      onClick={() => setPicked(o)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition ${sel ? 'border-brand-400 bg-brand-50/60 ring-1 ring-brand-300' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{formatDay(o.date)}</span>
                        <span className="truncate text-gray-500">{o.technicianName}</span>
                        {o.recommended && <Badge tone="success">Empfohlen</Badge>}
                      </div>
                      <p className="mt-1.5 text-gray-800">
                        <span className="text-gray-500">Weicht:</span> <strong>{o.displaced.customer}</strong>
                        <span className="text-gray-500"> · wartet seit {formatDay(o.displaced.createdAt.slice(0, 10))}</span>
                      </p>
                      <p className="truncate text-xs text-gray-500">{o.displaced.address}</p>
                      {o.displaced.notes && (
                        <p className="mt-1 truncate text-xs text-gray-600" title={o.displaced.notes}>
                          {o.displaced.timeWish ? <strong className="text-info-700">🕘 {o.displaced.timeWish} · </strong> : '📝 '}„{o.displaced.notes}“
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <DriveDelta delta={o.deltaDrive} />
                        {o.fallback ? (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                            → {formatDay(o.fallback.date)} · {o.fallback.technicianName}
                          </span>
                        ) : (
                          <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-800 ring-1 ring-warning-200">→ Warteliste</span>
                        )}
                        {o.displacesOlder && <span className="rounded-full bg-warning-50 px-2 py-0.5 text-xs font-medium text-warning-800 ring-1 ring-warning-200">ältere Anfrage</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            {options.length > 6 && !showAll && (
              <button className="mt-2 text-xs font-medium text-brand-600 hover:underline" onClick={() => setShowAll(true)}>
                Alle {options.length} Varianten anzeigen
              </button>
            )}
          </div>

          {/* Vorschau der gewählten Variante */}
          {picked && (
            <div className="rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">
                  {formatDay(picked.date)} · {picked.technicianName}
                </p>
                <DriveDelta delta={picked.deltaDrive} size="lg" />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Neuer Termin: <strong className="tabular-nums text-gray-800">{picked.start}–{picked.end}</strong> · Fenster {picked.after.window.start}–{picked.after.window.end}
                {picked.deltaDrive > 0 && ' · weicht von der fahrzeitoptimalen Route ab'}
                {picked.deltaDrive < 0 && ' · Route wird sogar kürzer'}
              </p>

              <table className="mt-3 w-full text-xs">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="pb-1 font-medium" />
                    <th className="pb-1 font-medium">Vorher</th>
                    <th className="pb-1 font-medium">Nachher</th>
                    <th className="pb-1 text-right font-medium">Differenz</th>
                  </tr>
                </thead>
                <tbody>
                  <Compare label="Arbeitstag" before={`${picked.before.departure}–${picked.before.returnHome}`} after={`${picked.after.departure}–${picked.after.returnHome}`} />
                  <Compare label="Gesamtdauer" before={dur(picked.before.totalMinutes)} after={dur(picked.after.totalMinutes)} delta={picked.after.totalMinutes - picked.before.totalMinutes} />
                  <Compare label="Fahrzeit" before={`${picked.before.driveMinutes} min`} after={`${picked.after.driveMinutes} min`} delta={picked.deltaDrive} />
                  <Compare label="Vor Ort" before={`${picked.before.workMinutes} min`} after={`${picked.after.workMinutes} min`} />
                  <Compare label="Termine" before={String(picked.before.stops.length)} after={String(picked.after.stops.length)} />
                </tbody>
              </table>

              <details className="mt-3" open>
                <summary className="cursor-pointer text-xs font-semibold text-gray-700">Neue Tagesroute</summary>
                <div className="mt-2">
                  <Timeline route={picked.after} removed={picked.displaced} />
                </div>
              </details>

              <div className={`mt-3 rounded-lg p-3 text-xs ${broken.length ? 'bg-danger-50' : 'bg-brand-50/60'}`}>
                <p className={`font-semibold ${broken.length ? 'text-danger-700' : 'text-brand-800'}`}>
                  {broken.length ? `✕ ${broken.length} Regel${broken.length === 1 ? '' : 'n'} verletzt` : '✓ Regelprüfung: alle Regeln eingehalten'}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {picked.checks.map((c) => (
                    <li key={c.label} className="flex gap-1.5">
                      <span className={c.ok ? 'text-brand-600' : 'text-danger-600'}>{c.ok ? '✓' : '✕'}</span>
                      <span className={c.ok ? 'text-gray-700' : 'font-medium text-danger-700'}>{c.label}</span>
                      {c.detail && <span className="ml-auto text-right text-gray-500">{c.detail}</span>}
                    </li>
                  ))}
                </ul>
              </div>

              {(picked.displacesOlder || !picked.fallback) && (
                <div className="mt-3 space-y-1 rounded-lg bg-warning-50 p-3 text-xs text-warning-900">
                  {picked.displacesOlder && <p>⚠ {picked.displaced.customer} ist älter – „ältere zuerst“ wird bewusst übergangen.</p>}
                  {!picked.fallback && <p>⚠ {picked.displaced.customer} passt in keinen anderen Tag und kommt auf die Warteliste.</p>}
                </div>
              )}

              <Input size="sm" className="mt-3" placeholder="Begründung (Pflicht), z. B. „Förderfrist endet“" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <p className="mt-1 text-[11px] text-gray-400">Nach dem Tausch wird die Woche neu geplant und unabhängig geprüft; der Tausch bleibt im Plan als Ausnahme sichtbar.</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
