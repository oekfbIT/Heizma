/**
 * @file      RequestPlanningCard.tsx – Karte „Planung“ je Anfrage: Status lesen, Änderungen über einen Dialog
 * @layer     Web · View-Komponente
 * @siehe     docs/03-planung-und-regeln.md#eingriffe-des-planers · docs/05-design-system.md#aktionen-karten-zeigen-dialoge-ändern · docs/10-code-navigation.md
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCore, useResource } from '@/core';
import { formatDateTime, formatDay } from '@/lib/format';
import type { AuditEntry, RequestPlanning, SlotOption } from '@/lib/types';
import type { DecisionInput } from '@/modules';
import { ActionList, Alert, Badge, Button, Input, Modal, type ActionItem, type BadgeTone } from '@/ui';
import EscalationDialog from './planner/EscalationDialog';

/**
 * Planung einer einzelnen Anfrage: wo steht sie, und was kann der Planer tun.
 * Muster (Design-System „Aktionen“): Die Karte zeigt nur den Status. Alles, was den Plan ändert,
 * startet über genau einen Button „Planung ändern …“ und läuft in einem Dialog mit Vorschau bzw. Begründung.
 * Wird auf der Anfrage-Seite und im Stopp-Dialog des Planers verwendet – gleiche Endpunkte, gleiche Logik.
 */

const STATUS: Record<RequestPlanning['status'], { label: string; tone: BadgeTone }> = {
  termin: { label: 'Termin (freigegeben)', tone: 'solid' },
  pinned: { label: 'Diese Woche · fixiert', tone: 'info-soft' },
  planned: { label: 'Diese Woche eingeplant', tone: 'success' },
  waitlist: { label: 'Warteliste', tone: 'warning-soft' },
  excluded: { label: 'Aus dem Plan genommen', tone: 'neutral' },
  unplannable: { label: 'Nicht planbar', tone: 'danger' },
};

const ACTION: Record<string, string> = {
  fixiert: 'Fixiert',
  'aus-plan': 'Aus dem Plan genommen',
  zurueckgesetzt: 'Entscheidung zurückgenommen',
  termin: 'Route freigegeben → Termin',
  'termin-zurueck': 'Freigabe zurückgenommen → wieder Anfrage',
  update: 'Stammdaten korrigiert',
  reset: 'Original wiederhergestellt',
  escalate: 'Eskaliert',
};

type Step = null | 'choose' | 'move' | 'pin' | 'exclude' | 'undo' | 'inform' | 'escalate';

export default function RequestPlanningCard({ requestId, compact, onChanged }: { requestId: string; compact?: boolean; onChanged?: () => void }) {
  const core = useCore();
  const planning = core.anfragen.planning.get(requestId);
  const { data: info, error } = useResource(planning);
  const anfragen = useResource(core.anfragen.data); // Kundenname, Eskalationen
  useResource(core.techniker.data); // Kurznamen der Personen
  const [step, setStep] = useState<Step>(null);
  const [options, setOptions] = useState<SlotOption[] | null>(null);
  const [picked, setPicked] = useState<SlotOption | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const close = () => {
    setStep(null);
    setPicked(null);
    setReason('');
    setShowAll(false);
  };
  const go = (s: Step) => {
    setPicked(null);
    setReason('');
    setShowAll(false);
    setStep(s);
  };

  async function openMove() {
    go('move');
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
      const result = await core.decideRequest(requestId, body); // plant neu und lädt alles Sichtbare nach
      close();
      // Meldung aus dem tatsächlichen Ergebnis der Neuplanung (Antwort des Schreib-Requests), nicht aus der Vorschau
      const fresh = result ?? planning.getState().data ?? (await planning.load());
      onChanged?.();
      if (fresh) setMsg({ tone: 'ok', text: typeof okText === 'function' ? okText(fresh) : okText });
    } catch (e) {
      setMsg({ tone: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  if (error && !info) return <section className="card p-4 text-sm text-danger-700">{error}</section>;
  if (!info) return <section className="card p-4 text-sm text-gray-400">Planung wird geladen …</section>;

  const st = STATUS[info.status];
  const d = info.decision;
  const locked = info.status === 'termin';
  const reasonOk = reason.trim().length >= 3;
  // Fehlerhafte Daten: nicht einplanbar – auch nicht als Ausnahme. Erst korrigieren, dann plant das System automatisch.
  // ACHTUNG · GRUND-PRAEFIX: prüft den Anfang von `reason` – muss zu den Texten in planner.ts buildPlan() passen
  const dataBlocked = !!info.reason && /^(Datenfehler|Keine Koordinaten|Nicht zuordenbar)/.test(info.reason);
  const request = core.anfragen.byId(requestId);
  const customer = request?.customer ?? requestId;
  const escalation = anfragen.data?.escalations[requestId];

  // MARK: Mögliche Änderungen – je Status nur, was fachlich Sinn ergibt
  const actions: ActionItem[] = [];
  if (!locked && info.status !== 'excluded' && !dataBlocked) {
    if (info.route) {
      actions.push({ key: 'move', icon: 'move', title: 'Verschieben', description: 'Anderer Tag oder andere Person – mit Uhrzeit und Zusatz-Fahrzeit als Vorschau.', onSelect: () => void openMove() });
      if (info.status === 'planned') actions.push({ key: 'pin', icon: 'pin', title: 'Fixieren', description: 'Bleibt bei jeder Neuplanung an diesem Tag und bei dieser Person.', onSelect: () => go('pin') });
    } else {
      actions.push({ key: 'move', icon: 'calendar', title: 'Manuell einplanen', description: 'Tag und Person selbst wählen. Ein Regelbruch geht nur mit Begründung.', tone: 'warning', onSelect: () => void openMove() });
    }
    if (d) actions.push({ key: 'undo', icon: 'reset', title: undoLabel(d.mode), description: 'Das System plant die Anfrage wieder automatisch ein.', onSelect: () => go('undo') });
    actions.push({ key: 'exclude', icon: 'remove', title: 'Aus dem Plan nehmen', description: 'Bleibt offen, wird aber nicht eingeplant, bis du sie wieder aufnimmst.', onSelect: () => go('exclude') });
  }
  // Benachrichtigen statt umplanen: wartet wegen Kapazität → Kunde; passt fachlich nicht (Zuständigkeit, Verfügbarkeit) → intern
  if (!locked && request && !escalation) {
    if (info.status === 'waitlist')
      actions.push({ key: 'inform', icon: 'note', title: 'Kunde informieren', description: 'Entwurf mit neuem Terminvorschlag – wird gespeichert, nicht versendet.', onSelect: () => go('inform') });
    if (info.status === 'unplannable' && info.reason && !/^(Datenfehler|Keine Koordinaten)/.test(info.reason))
      actions.push({ key: 'escalate', icon: 'alert', title: 'Intern eskalieren', description: 'Nachricht an Vertrieb/Planung: Zuständigkeit oder Verfügbarkeit klären.', onSelect: () => go('escalate') });
  }

  return (
    <section className={compact ? '' : 'card p-4 md:p-5'}>
      {/* MARK: Status */}
      <div className="flex flex-wrap items-center gap-2">
        {!compact && <h2 className="mr-1 text-sm font-semibold">Planung</h2>}
        <Badge strong tone={st.tone}>
          {st.label}
        </Badge>
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

      {/* MARK: Wann und bei wem – oder warum nicht */}
      <div className="mt-3 text-sm">
        {info.route ? (
          <>
            <p className="text-base font-semibold tabular-nums text-ink">
              {formatDay(info.route.date)} · {info.route.start}–{info.route.end}
            </p>
            <p className="text-gray-600">
              {info.route.technicianName} · Stopp {info.route.position} von {info.route.stops}
              {!compact && (
                <Link to="/planer" className="ml-2 text-brand-600 hover:underline">
                  In der Routenplanung zeigen →
                </Link>
              )}
            </p>
          </>
        ) : (
          <p className="text-gray-700">{info.reason ?? 'Nicht eingeplant'}</p>
        )}
        {info.waitlist && (
          <p className="mt-1 text-xs text-gray-500">
            Platz {info.waitlist.position} von {info.waitlist.total} der Wartenden (nach Eingang, ältere zuerst)
          </p>
        )}
        {escalation && (
          <p className="mt-1 text-xs text-brand-700">
            ✓ {escalation.type === 'customer_delay' ? `Kunde informiert – neuer Termin ${escalation.newDate ? formatDay(escalation.newDate) : ''}` : 'Intern eskaliert'} ·{' '}
            <button className="underline hover:text-brand-800" disabled={busy} onClick={() => void core.withdrawRequestEscalation(requestId)}>
              zurücknehmen
            </button>
          </p>
        )}
        {dataBlocked && <p className="mt-1 text-xs text-gray-500">Wird automatisch eingeplant, sobald die markierten Daten unten korrigiert und gespeichert sind.</p>}
        {locked && <p className="mt-1 text-xs text-gray-500">Teil einer freigegebenen Route. Ändern erst nach „Freigabe zurücknehmen“ in der Routenplanung.</p>}
        {d?.reason && (
          <p className="mt-1 text-xs text-gray-500">
            Begründung: „{d.reason}“ · {formatDateTime(d.at)}
          </p>
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

      {/* MARK: Notiz aus dem Vertrieb – nur zur Information, wird nicht automatisch ausgewertet */}
      {info.notes && (
        <div className="mt-3 rounded-lg border border-info-200 bg-info-50 px-3 py-2 text-sm text-info-900">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-info-700">Notiz aus dem Vertrieb</p>
          <p className="mt-0.5">„{info.notes}“</p>
        </div>
      )}

      {/* MARK: Genau ein Einstieg für Änderungen */}
      {(actions.length > 0 || info.status === 'excluded') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {info.status === 'excluded' ? (
            <Button size="sm" icon="reset" disabled={busy} onClick={() => void send(null, 'Wieder aufgenommen – wird automatisch eingeplant.')}>
              Wieder aufnehmen
            </Button>
          ) : (
            <Button size="sm" icon="edit" disabled={busy} onClick={() => go('choose')}>
              Planung ändern …
            </Button>
          )}
        </div>
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

      {/* MARK: Dialoge */}
      {step === 'choose' && (
        <Modal eyebrow={customer} title="Planung ändern" onClose={close} footer={<Button onClick={close}>Abbrechen</Button>}>
          <p className="mt-1 text-sm text-gray-500">Jede Änderung plant die Woche neu und wird unabhängig gegen alle Regeln geprüft.</p>
          <ActionList items={actions} />
        </Modal>
      )}

      {step === 'move' && (
        <Modal
          eyebrow={customer}
          title={info.route ? 'Verschieben' : 'Manuell einplanen'}
          onClose={close}
          footer={
            <>
              <Button onClick={() => go('choose')}>Zurück</Button>
              <Button
                variant={picked?.warnings.length ? 'warning' : 'primary'}
                disabled={!picked || busy || (picked.warnings.length > 0 && !reasonOk)}
                onClick={() =>
                  picked &&
                  void send({ mode: 'pin', technicianId: picked.technicianId, date: picked.date, reason, override: picked.warnings.length > 0 }, (f) =>
                    f.exceptions.length
                      ? 'Als bewusste Ausnahme eingeplant – im Plan gelb markiert.'
                      : f.violations.length
                        ? 'Eingeplant, verletzt aber Regeln (rot) – bitte prüfen.'
                        : f.route
                          ? `Eingeplant: ${formatDay(f.route.date)} ${f.route.start}–${f.route.end}.`
                          : `Nicht eingeplant: ${f.reason ?? 'unbekannt'}`,
                  )
                }
              >
                {picked?.warnings.length ? 'Trotzdem einplanen (Ausnahme)' : 'Übernehmen'}
              </Button>
            </>
          }
        >
          <p className="mt-1 text-sm text-gray-500">Alle möglichen Tage, regelkonforme mit wenig Zusatz-Fahrzeit zuerst.</p>
          {!options ? (
            <p className="mt-3 text-sm text-gray-400">Optionen werden berechnet …</p>
          ) : options.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Keine Optionen – bitte zuerst Adresse bzw. Koordinaten korrigieren.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-1">
                {(showAll ? options : options.slice(0, 6)).map((o) => {
                  const key = `${o.technicianId}@${o.date}`;
                  const sel = picked && `${picked.technicianId}@${picked.date}` === key;
                  return (
                    <li key={key}>
                      <button
                        disabled={!!o.blocked || o.current}
                        onClick={() => {
                          setPicked(o);
                          setReason('');
                        }}
                        className={`flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition ${
                          sel ? 'border-brand-400 bg-brand-50 ring-1 ring-brand-300' : 'border-gray-100 hover:bg-gray-50'
                        } ${o.blocked || o.current ? 'cursor-not-allowed opacity-60' : ''}`}
                      >
                        <span className={`mt-0.5 ${o.blocked ? 'text-gray-400' : o.warnings.length ? 'text-warning-500' : 'text-brand-600'}`}>{o.blocked ? '✕' : o.warnings.length ? '⚠' : '✓'}</span>
                        <span className="min-w-0 flex-1">
                          <span className="font-semibold">{formatDay(o.date)}</span> · {o.technicianName}
                          {o.start && <span className="tabular-nums text-gray-500"> · ca. {o.start}</span>}
                          {o.current && <span className="text-gray-500"> · aktuell</span>}
                          {(o.blocked ?? o.warnings[0]) && <span className={`block text-xs ${o.blocked ? 'text-gray-500' : 'text-warning-700'}`}>{o.blocked ?? o.warnings.join(' · ')}</span>}
                        </span>
                        {!o.blocked && !o.current && <span className="shrink-0 text-xs tabular-nums text-gray-500">+{o.deltaDrive} min Fahrt</span>}
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
          {picked && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${picked.warnings.length ? 'bg-warning-50 text-warning-900' : 'bg-gray-50 text-gray-700'}`}>
              <p className="font-semibold">Vorschau</p>
              <p>
                Neu: {formatDay(picked.date)} · {picked.technicianName}
                {picked.start && ` · ca. ${picked.start}–${picked.end}`} · +{picked.deltaDrive} min Fahrt
              </p>
              {info.route && (
                <p>
                  Bisher: {formatDay(info.route.date)} · {info.route.technicianName} · {info.route.start}–{info.route.end}
                </p>
              )}
              {picked.warnings.length > 0 && (
                <>
                  <p className="mt-2 font-semibold">Verstößt gegen Regeln:</p>
                  {picked.warnings.map((w) => (
                    <p key={w}>⚠ {w}</p>
                  ))}
                </>
              )}
              <Input
                size="sm"
                className="mt-2"
                placeholder={picked.warnings.length ? 'Begründung (Pflicht), z. B. „Kunde besteht auf Donnerstag“' : 'Notiz (optional)'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}
        </Modal>
      )}

      {step === 'pin' && info.route && (
        <ConfirmDialog
          customer={customer}
          title="Fixieren"
          text={`${formatDay(info.route.date)} · ${info.route.technicianName} bleibt bei jeder Neuplanung gesetzt. Die Uhrzeit kann sich innerhalb des Tages noch verschieben.`}
          cta="Fixieren"
          busy={busy}
          onBack={() => go('choose')}
          onClose={close}
          onConfirm={() => void send({ mode: 'pin', technicianId: info.route!.technicianId, date: info.route!.date, reason: '' }, 'Fixiert – bleibt bei Neuplanung an diesem Tag und bei dieser Person.')}
        />
      )}

      {step === 'undo' && d && (
        <ConfirmDialog
          customer={customer}
          title={undoLabel(d.mode)}
          text="Deine Entscheidung wird entfernt. Das System plant die Anfrage danach wieder automatisch ein (ältere zuerst)."
          cta={undoLabel(d.mode)}
          busy={busy}
          onBack={() => go('choose')}
          onClose={close}
          onConfirm={() => void send(null, 'Zurückgenommen – wird wieder automatisch eingeplant.')}
        />
      )}

      {step === 'exclude' && (
        <ConfirmDialog
          customer={customer}
          title="Aus dem Plan nehmen"
          text="Die Anfrage bleibt offen, wird aber nicht eingeplant, bis du sie wieder aufnimmst. Ihr Platz wird neu vergeben."
          cta="Aus dem Plan nehmen"
          busy={busy}
          reason={{ value: reason, set: setReason, placeholder: 'Grund (Pflicht), z. B. „Kunde ruft zurück“' }}
          onBack={() => go('choose')}
          onClose={close}
          onConfirm={() => void send({ mode: 'exclude', reason }, 'Aus dem Plan genommen.')}
        />
      )}

      {(step === 'inform' || step === 'escalate') && request && (
        <EscalationDialog
          request={request}
          reason={info.reason ?? ''}
          type={step === 'inform' ? 'customer_delay' : 'internal'}
          suggestedDate={info.route?.date ?? ''}
          onClose={close}
          onDone={() => {
            close();
            setMsg({ tone: 'ok', text: step === 'inform' ? 'Benachrichtigung gespeichert (Prototyp: nicht versendet).' : 'Eskalation gespeichert (Prototyp: nicht versendet).' });
          }}
        />
      )}

    </section>
  );
}

const undoLabel = (mode: string) => (mode === 'pin' ? 'Fixierung lösen' : 'Entscheidung zurücknehmen');

/** Bestätigungs-Dialog im Aktionen-Muster: was passiert, optional Pflicht-Begründung, Zurück / Bestätigen */
function ConfirmDialog(p: {
  customer: string;
  title: string;
  text: string;
  cta: string;
  busy: boolean;
  reason?: { value: string; set: (v: string) => void; placeholder: string };
  onBack: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const needsReason = !!p.reason && p.reason.value.trim().length < 3;
  return (
    <Modal
      eyebrow={p.customer}
      title={p.title}
      onClose={p.onClose}
      footer={
        <>
          <Button onClick={p.onBack}>Zurück</Button>
          <Button variant="primary" disabled={p.busy || needsReason} onClick={p.onConfirm}>
            {p.cta}
          </Button>
        </>
      }
    >
      <p className="mt-2 text-sm text-gray-600">{p.text}</p>
      {p.reason && <Input className="mt-3" placeholder={p.reason.placeholder} value={p.reason.value} onChange={(e) => p.reason!.set(e.target.value)} autoFocus />}
    </Modal>
  );
}
