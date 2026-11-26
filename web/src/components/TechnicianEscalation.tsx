import { useState } from 'react';
import Icon from '@/components/ui/Icon';
import { apiSend, useApi, type Escalation, type Stammdaten } from '@/lib/api';
import { formatDay } from '@/lib/format';
import { regionLabel } from '@/lib/regions';
import type { Issue, Plan, ServiceRequest, Technician } from '@/lib/types';

type Target = 'techniker' | 'vertrieb';

const city = (address: string) => address.split(',').pop()?.trim() ?? address;
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

/** Welche Probleme lassen sich nur mit Rückfrage lösen? */
const ESCALATE_CODES = ['NO_AVAILABILITY', 'ALL_BLOCKED', 'NO_REGION'];

interface Props {
  technician: Technician;
  issues: Issue[];
  data: Stammdaten;
}

/**
 * Eskalation für Techniker-Probleme (keine Verfügbarkeit, kein Gebiet):
 * Techniker:in anfragen und/oder Vertrieb informieren, dass eine Lösung nötig ist.
 * Simuliert – Nachricht wird gespeichert, nicht versendet.
 */
export default function TechnicianEscalation({ technician, issues, data }: Props) {
  const plan = useApi<Plan>('/api/plan');
  const [compose, setCompose] = useState<Target | null>(null);
  const relevant = issues.filter((i) => ESCALATE_CODES.includes(i.code));
  if (!relevant.length) return null;

  const noAvailability = relevant.some((i) => i.code === 'NO_AVAILABILITY' || i.code === 'ALL_BLOCKED');
  const unplanned = new Set(plan.data?.unassigned.map((u) => u.requestId) ?? []);
  const resp = data.responsibility ?? {};
  // Betroffen: offene Anfragen dieser Person bzw. (ohne Gebiet) zuständigkeitslose Anfragen in der Nähe
  const affected: ServiceRequest[] = data.requests.filter((r) => {
    if (!unplanned.has(r.id)) return false;
    if (noAvailability) return (resp[r.id] ?? []).includes(technician.id);
    return (resp[r.id] ?? []).length === 0 && r.lat != null && r.lng != null && km(technician.home, { lat: r.lat, lng: r.lng }) <= 80;
  });

  const region = regionLabel(technician);
  const week = `${formatDay(data.range.from)} – ${formatDay(data.range.to)}`;
  const list = affected.map((r) => `• ${r.id} · ${r.customer} · ${city(r.address)}`).join('\n') || '• (keine offenen Anfragen gefunden)';
  const reason = noAvailability ? 'keine Verfügbarkeit eingetragen' : 'kein Einsatzgebiet hinterlegt';

  const texts: Record<Target, { title: string; recipient: string; button: string; body: string }> = {
    techniker: {
      title: `${technician.name} anfragen`,
      recipient: technician.name,
      button: noAvailability ? 'Verfügbarkeit anfragen' : 'Gebiet bestätigen lassen',
      body: noAvailability
        ? `Hallo,

für die Woche ${week} ist bei dir keine Verfügbarkeit eingetragen. In deiner Region ${region} warten aktuell ${affected.length} Besichtigung(en):

${list}

Bitte trag deine Verfügbarkeit ein – oder gib kurz Bescheid, falls du verhindert bist (Urlaub/Krankenstand), dann organisieren wir eine Vertretung.

Danke!
Planung`
        : `Hallo,

für dich ist aktuell kein Einsatzgebiet hinterlegt. Dadurch können wir dir nur Anfragen im Umkreis von 15 km um ${technician.home.label} zuteilen. In deiner Nähe warten ${affected.length} Besichtigung(en):

${list}

Bitte bestätige, welches Gebiet du abdeckst, damit wir es eintragen können.

Danke!
Planung`,
    },
    vertrieb: {
      title: 'An den Vertrieb melden',
      recipient: 'Vertrieb / Planung',
      button: 'An den Vertrieb melden',
      body: `Region ${region} (${technician.name}, ${technician.home.label}): ${reason}.

Dadurch können in der Woche ${week} ${affected.length} Besichtigung(en) nicht eingeplant werden:

${list}

Wir brauchen eine Lösung:
• Verfügbarkeit bzw. Gebiet mit ${technician.name} klären
• Vertretung aus einer Nachbarregion prüfen
• oder betroffene Kunden über die Verschiebung informieren`,
    },
  };

  const key = (t: Target) => `technicians:${technician.id}:${t}`;
  const sent = (t: Target): Escalation | undefined => data.escalations?.[key(t)];

  return (
    <div className="card mt-4 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Lösung nötig</p>
          <p className="text-sm text-gray-500">
            {reason.charAt(0).toUpperCase() + reason.slice(1)} · {affected.length} offene Anfrage(n) betroffen. Das lässt sich nicht in den Daten
            korrigieren – eine Rückfrage ist nötig.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {(['techniker', 'vertrieb'] as Target[]).map((t) => {
          const esc = sent(t);
          return esc ? (
            <div key={t} className="flex items-center justify-between gap-2 rounded-lg bg-brand-50 px-3 py-2.5 text-sm">
              <span className="font-medium text-brand-800">
                ✓ {t === 'techniker' ? 'Außendienst angefragt' : 'Vertrieb informiert'}
                <span className="block text-xs font-normal text-brand-700/80">
                  {new Date(esc.at).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </span>
              <button
                className="text-xs font-medium text-brand-700 underline"
                onClick={async () => {
                  await apiSend(`/api/escalations/technicians/${technician.id}/${t}`, 'DELETE');
                  window.dispatchEvent(new Event('heizma:data-changed'));
                }}
              >
                Rückgängig
              </button>
            </div>
          ) : (
            <button
              key={t}
              onClick={() => setCompose(t)}
              className={t === 'techniker' ? 'btn-primary w-full' : 'btn-secondary w-full'}
              disabled={!plan.data}
            >
              {texts[t].button}
            </button>
          );
        })}
      </div>

      {compose && (
        <ComposeDialog
          title={texts[compose].title}
          recipient={texts[compose].recipient}
          initial={texts[compose].body}
          submitLabel={compose === 'techniker' ? 'Als gesendet markieren' : 'Eskalieren'}
          onClose={() => setCompose(null)}
          onSubmit={async (message) => {
            await apiSend(`/api/escalations/technicians/${technician.id}/${compose}`, 'POST', {
              recipient: texts[compose].recipient,
              message,
              affectedRequests: affected.map((r) => r.id),
            });
            setCompose(null);
            window.dispatchEvent(new Event('heizma:data-changed'));
          }}
        />
      )}
    </div>
  );
}

function ComposeDialog(props: { title: string; recipient: string; initial: string; submitLabel: string; onClose: () => void; onSubmit: (m: string) => Promise<void> }) {
  const [message, setMessage] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/30 sm:items-center sm:p-4" onClick={props.onClose}>
      <div className="card max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-b-none p-5 sm:rounded-b-xl sm:p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">An: {props.recipient}</p>
        <h2 className="mt-1 text-lg font-semibold">{props.title}</h2>
        <textarea rows={13} className="input mt-4" value={message} onChange={(e) => setMessage(e.target.value)} />
        <p className="mt-2 text-xs text-gray-400">Prototyp: Die Nachricht wird gespeichert und markiert, nicht versendet.</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
          <button className="btn-secondary" onClick={props.onClose}>
            Abbrechen
          </button>
          <button
            className="btn-primary"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await props.onSubmit(message);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Wird gespeichert …' : props.submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
