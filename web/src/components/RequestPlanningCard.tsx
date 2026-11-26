import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore, useResource } from '@/core';
import { formatDateTime, formatDay } from '@/lib/format';
import type { AuditEntry, RequestPlanning, SlotOption } from '@/lib/types';
import type { DecisionInput } from '@/modules';
import { Alert, Badge, Button, Card, Input, type BadgeTone } from '@/ui';

/**
 * Planung einer einzelnen Anfrage: wo steht sie, und was kann der Planer tun.
 * Grundsatz: Das System schlägt vor, der Planer entscheidet. Regelbrüche sind möglich,
 * brauchen aber eine Begründung und bleiben im Plan als Ausnahme sichtbar.
 * Wird auf der Anfrage-Seite und im Stopp-Dialog des Planers verwendet – gleiche Endpunkte, gleiche Logik.
 */

const STATUS: Record<RequestPlanning['status'], { label: string; tone: BadgeTone }> = {
  termin: { label: 'Termin (freigegeben)', tone: 'solid' },
  pinned: { label: '📌 Manuell fixiert', tone: 'info-soft' },
  planned: { label: 'Vorgeschlagen', tone: 'success' },
  waitlist: { label: 'Warteliste', tone: 'warning-soft' },
  excluded: { label: 'Aus dem Plan genommen', tone: 'neutral' },
  unplannable: { label: 'Nicht planbar', tone: 'danger' },
};

const ACTION: Record<string, string> = {
  fixiert: 'Fixiert',
  'aus-plan': 'Aus dem Plan genommen',
  vorgezogen: 'Vorgezogen',
  zurueckgesetzt: 'Entscheidung zurückgenommen',
  termin: 'Route freigegeben → Termin',
  'termin-zurueck': 'Freigabe zurückgenommen → wieder Anfrage',
  update: 'Stammdaten korrigiert',
  reset: 'Original wiederhergestellt',
  escalate: 'Eskaliert',
};

type Mode = null | 'move' | 'exclude' | 'prioritize';

export default function RequestPlanningCard({ requestId, compact, onChanged }: { requestId: string; compact?: boolean; onChanged?: () => void }) {
  const core = useCore();
  const planning = core.anfragen.planning.get(requestId);
  const { data: info, error } = useResource(planning);
  const [mode, setMode] = useState<Mode>(null);
  const [options, setOptions] = useState<SlotOption[] | null>(null);
  const [picked, setPicked] = useState<SlotOption | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const reset = () => {
    setMode(null);
    setPicked(null);
    setReason('');
    setShowAll(false);
  };

  async function openMove() {
    reset();
    setMode('move');
    setOptions(null);
    try {
      setOptions(await core.anfragen.options(requestId));
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    }
  }

  async function send(body: DecisionInput | null, okText: string | ((fresh: RequestPlanning) => string)) {
    setBusy(true);
    setMsg(null);
    try {
      await core.decideRequest(requestId, body); // plant neu und lädt alles Sichtbare nach
      reset();
      // Meldung aus dem tatsächlichen Ergebnis der Neuplanung, nicht aus der Vorschau
      const fresh = planning.getState().data ?? (await planning.load());
      onChanged?.();
      if (fresh) setMsg({ tone: 'ok', text: typeof okText === 'function' ? okText(fresh) : okText });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <Card className="p-4 text-sm text-danger-700">{error}</Card>;
  if (!info) return <Card className="p-4 text-sm text-gray-400">Planung wird geladen …</Card>;

  const st = STATUS[info.status];
  const d = info.decision;
  const locked = info.status === 'termin';
  const reasonOk = reason.trim().length >= 3;
  // Fehlerhafte Daten: nicht einplanbar – auch nicht als Ausnahme. Erst korrigieren, dann plant das System automatisch.
  const dataBlocked = !!info.reason && /^(Datenfehler|Keine Koordinaten|Nicht zuordenbar)/.test(info.reason);

  return (
    <section className={compact ? '' : 'card p-4 md:p-5'}>
      {/* Status */}
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <h2 className="mr-1 text-sm font-semibold">Planung</h2>}
        <Badge strong tone={st.tone}>
          {st.label}
        </Badge>
        {d?.mode === 'prioritize' && (
          <Badge strong tone="accent">
            ⇡ Vorgezogen
          </Badge>
        )}
        {info.exceptions.length > 0 && (
          <Badge strong tone="warning-soft">
            Bewusste Ausnahme
          </Badge>
        )}
        {info.violations.length > 0 && (
          <Badge strong tone="danger-soft">
            Regelverstoß
          </Badge>
        )}
      </div>

      <div className="mt-2 text-sm text-gray-700">
        {info.route ? (
          <p>
            <strong>{formatDay(info.route.date)}</strong> · {info.route.technicianName} ·{' '}
            <strong className="tabular-nums">
              {info.route.start}–{info.route.end}
            </strong>{' '}
            <span className="text-gray-500">
              (Stopp {info.route.position} von {info.route.stops})
            </span>
            {!compact && (
              <Link to="/planer" className="ml-2 text-brand-600 hover:underline">
                In der Routenplanung öffnen →
              </Link>
            )}
          </p>
        ) : (
          <p className="text-gray-600">{info.reason ?? 'Nicht eingeplant'}</p>
        )}
        {info.waitlist && (
          <p className="mt-1 text-xs text-gray-500">
            Platz {info.waitlist.position} von {info.waitlist.total} auf der Warteliste (nach Eingang)
          </p>
        )}
        {dataBlocked && (
          <Alert tone="danger" size="sm" className="mt-2 rounded-lg px-3 py-2">
            Mit fehlerhaften Daten kann die Anfrage nicht eingeplant werden – auch nicht manuell. Korrigiere die markierten Felder unten
            (Adresse, Koordinaten, Uhrzeit …) und speichere: Prüfung und Routenplanung laufen dann neu, die Anfrage wird automatisch eingeplant.
          </Alert>
        )}
        {locked && (
          <p className="mt-1 text-xs text-gray-500">
            Teil einer freigegebenen Route – wird in Produktion als Termin im Heizma-Backend angelegt. Änderungen sind erst nach „Freigabe zurücknehmen“ möglich.
          </p>
        )}
        {d && d.reason && (
          <p className="mt-1 text-xs text-gray-500">
            Begründung: „{d.reason}“ · {formatDateTime(d.at)}
          </p>
        )}
        {d?.mode === 'prioritize' && info.status === 'waitlist' && (
          <Alert tone="warning" size="sm" className="mt-1">
            Vorgezogen, passt aber regelkonform in keinen Tag. Über „Einplanen …“ lässt sich die Anfrage als bewusste Ausnahme einplanen.
          </Alert>
        )}
        {info.violations.map((v) => (
          <p key={v} className="mt-1 text-xs font-medium text-danger-600">
            ⚠ {v}
          </p>
        ))}
        {info.exceptions.map((e, i) => (
          <p key={i} className="mt-1 text-xs text-warning-700">
            ◆ {e.message} <span className="text-warning-600">– „{e.reason}“</span>
          </p>
        ))}
      </div>

      {/* Aktionen */}
      {!locked && mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!dataBlocked && (
            <Button size="sm" disabled={busy} onClick={() => void openMove()}>
              {info.route ? 'Verschieben …' : 'Einplanen …'}
            </Button>
          )}
          {info.status === 'planned' && info.route && (
            <Button
              size="sm"
              disabled={busy}
              title="Bleibt bei Neuplanung an diesem Tag und bei dieser Person"
              onClick={() => void send({ mode: 'pin', technicianId: info.route!.technicianId, date: info.route!.date, reason: '' }, 'Fixiert – bleibt bei Neuplanung an diesem Tag und bei dieser Person.')}
            >
              📌 Fixieren
            </Button>
          )}
          {info.status === 'waitlist' && !dataBlocked && d?.mode !== 'prioritize' && (
            <Button size="sm" disabled={busy} onClick={() => { reset(); setMode('prioritize'); }}>
              ⇡ Vorziehen
            </Button>
          )}
          {info.status !== 'excluded' && (
            <Button size="sm" disabled={busy} onClick={() => { reset(); setMode('exclude'); }}>
              Aus dem Plan nehmen
            </Button>
          )}
          {d && (
            <Button size="sm" disabled={busy} onClick={() => void send(null, 'Zurückgenommen – Anfrage wird wieder automatisch eingeplant.')}>
              {d.mode === 'pin' ? 'Fixierung lösen' : d.mode === 'exclude' ? 'Wieder aufnehmen' : 'Vorziehen zurücknehmen'}
            </Button>
          )}
        </div>
      )}

      {/* Verschieben: sortierte Vorschläge statt leerer Auswahl */}
      {mode === 'move' && (
        <div className="mt-3 rounded-xl border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mögliche Tage – beste zuerst</p>
            <button className="text-xs text-gray-500 hover:underline" onClick={reset}>
              Abbrechen
            </button>
          </div>
          {!options ? (
            <p className="text-sm text-gray-400">Optionen werden berechnet …</p>
          ) : options.length === 0 ? (
            <p className="text-sm text-gray-500">Keine Optionen – die Anfrage hat keine Koordinaten. Bitte zuerst Adresse bzw. Koordinaten korrigieren.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {(showAll ? options : options.slice(0, 6)).map((o) => {
                  const key = `${o.technicianId}@${o.date}`;
                  const sel = picked && `${picked.technicianId}@${picked.date}` === key;
                  return (
                    <li key={key}>
                      <button
                        disabled={!!o.blocked || o.current}
                        onClick={() => { setPicked(o); setReason(''); }}
                        className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                          sel ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-gray-100 hover:bg-gray-50'
                        } ${o.blocked || o.current ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span className={`mt-0.5 ${o.blocked ? 'text-gray-400' : o.warnings.length ? 'text-warning-500' : 'text-brand-600'}`}>{o.blocked ? '✕' : o.warnings.length ? '⚠' : '✓'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{formatDay(o.date)}</span> · {o.technicianName}
                          {o.start && <span className="tabular-nums text-gray-500"> · ca. {o.start}</span>}
                          {o.current && <span className="text-gray-500"> · aktuell</span>}
                          {(o.blocked ?? o.warnings[0]) && <span className={`block ${o.blocked ? 'text-gray-500' : 'text-warning-700'}`}>{o.blocked ?? o.warnings.join(' · ')}</span>}
                        </span>
                        {!o.blocked && !o.current && <span className="shrink-0 tabular-nums text-gray-500">+{o.deltaDrive} min</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {options.length > 6 && !showAll && (
                <button className="mt-1 text-xs text-brand-600 hover:underline" onClick={() => setShowAll(true)}>
                  Alle {options.length} Tage anzeigen
                </button>
              )}
            </>
          )}

          {/* Vorschau vor dem Übernehmen */}
          {picked && (
            <div className={`mt-3 rounded-lg p-3 text-xs ${picked.warnings.length ? 'bg-warning-50 text-warning-900' : 'bg-gray-50 text-gray-700'}`}>
              <p className="font-semibold">Vorschau</p>
              <p>
                Neu: {formatDay(picked.date)} · {picked.technicianName}
                {picked.start && ` · ca. ${picked.start}–${picked.end}`} · Route {picked.stopsBefore} → {picked.stopsBefore + 1} Stopps · +{picked.deltaDrive} min Fahrt
              </p>
              {info.route && (
                <p>
                  Bisher: {formatDay(info.route.date)} · {info.route.technicianName}
                  {options?.find((o) => o.current)?.sourceSaving ? ` · −${options.find((o) => o.current)!.sourceSaving} min Fahrt` : ''}
                </p>
              )}
              {picked.warnings.length > 0 ? (
                <>
                  <p className="mt-2 font-semibold">Verstößt gegen Regeln:</p>
                  {picked.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                  <Input size="sm" className="mt-2" placeholder="Begründung (Pflicht), z. B. „Kunde besteht auf Donnerstag“" value={reason} onChange={(e) => setReason(e.target.value)} />
                </>
              ) : (
                <Input size="sm" className="mt-2" placeholder="Notiz (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
              <p className="mt-2 text-[11px] opacity-70">Vorschau auf Basis des aktuellen Plans. Nach dem Übernehmen wird die Woche neu geplant und unabhängig geprüft.</p>
              <Button
                variant={picked.warnings.length ? 'warning' : 'primary'}
                size="sm"
                block
                className="mt-2"
                disabled={busy || (picked.warnings.length > 0 && !reasonOk)}
                onClick={() =>
                  void send(
                    { mode: 'pin', technicianId: picked.technicianId, date: picked.date, reason, override: picked.warnings.length > 0 },
                    (f) =>
                      f.exceptions.length
                        ? 'Als bewusste Ausnahme eingeplant – im Plan gelb markiert.'
                        : f.violations.length
                          ? 'Eingeplant, verletzt aber Regeln (rot) – bitte prüfen.'
                          : f.route
                            ? `Eingeplant: ${formatDay(f.route.date)} ${f.route.start}–${f.route.end} – nach Neuplanung ohne Regelbruch.`
                            : `Nicht eingeplant: ${f.reason ?? 'unbekannt'}`,
                  )
                }
              >
                {picked.warnings.length ? 'Trotzdem einplanen (Ausnahme)' : 'Übernehmen'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Aus dem Plan nehmen */}
      {mode === 'exclude' && (
        <ReasonBox
          title="Aus dem Plan nehmen"
          hint="Die Anfrage bleibt offen, wird aber nicht automatisch eingeplant, bis du sie wieder aufnimmst."
          placeholder="Grund, z. B. „Kunde ruft zurück“"
          cta="Aus dem Plan nehmen"
          reason={reason}
          setReason={setReason}
          busy={busy}
          onCancel={reset}
          onConfirm={() => void send({ mode: 'exclude', reason }, 'Aus dem Plan genommen.')}
        />
      )}

      {/* Vorziehen – bricht „ältere zuerst“ bewusst */}
      {mode === 'prioritize' && (
        <ReasonBox
          title="Vorziehen"
          warn={info.olderWaiting > 0 ? `${info.olderWaiting} ältere Anfrage${info.olderWaiting === 1 ? '' : 'n'} warte${info.olderWaiting === 1 ? 't' : 'n'} noch. Die Regel „ältere zuerst“ wird hier bewusst übergangen.` : undefined}
          hint="Wird vor allen anderen eingeplant, sofern ein Tag regelkonform passt. Im Plan als Ausnahme sichtbar."
          placeholder="Begründung (Pflicht), z. B. „Förderfrist endet“"
          cta="Vorziehen"
          reason={reason}
          setReason={setReason}
          busy={busy}
          onCancel={reset}
          onConfirm={() => void send({ mode: 'prioritize', reason }, (f) => (f.route ? `Vorgezogen und eingeplant: ${formatDay(f.route.date)} ${f.route.start}.` : 'Vorgezogen – passt aber in keinen Tag regelkonform.'))}
        />
      )}

      {msg && (
        <Alert tone={msg.tone === 'ok' ? 'success' : 'danger'} size="sm" className="mt-3">
          {msg.text}
        </Alert>
      )}

      {info.log.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-gray-500">Änderungsprotokoll ({info.log.length})</summary>
          <ul className="mt-1 space-y-0.5">
            {info.log.map((l: AuditEntry, i) => (
              <li key={i} className="text-[11px] text-gray-500">
                <span className="tabular-nums">{formatDateTime(l.at.replace('Z', ''))}</span> · {ACTION[l.action] ?? l.action}
                {l.reason && <span> – „{l.reason}“</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ReasonBox(p: {
  title: string;
  hint: string;
  warn?: string;
  placeholder: string;
  cta: string;
  reason: string;
  setReason: (v: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-gray-200 p-3 text-xs">
      <p className="font-semibold">{p.title}</p>
      {p.warn && (
        <Alert tone="warning" size="sm" className="mt-1">
          ⚠ {p.warn}
        </Alert>
      )}
      <p className="mt-1 text-gray-500">{p.hint}</p>
      <Input size="sm" className="mt-2" placeholder={p.placeholder} value={p.reason} onChange={(e) => p.setReason(e.target.value)} autoFocus />
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="flex-1" onClick={p.onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" size="sm" className="flex-1" disabled={p.busy || p.reason.trim().length < 3} onClick={p.onConfirm}>
          {p.cta}
        </Button>
      </div>
    </div>
  );
}
