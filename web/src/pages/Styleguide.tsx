import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  FieldMessage,
  Input,
  Loading,
  Modal,
  Page,
  PageHeader,
  SegmentedControl,
  Textarea,
  type BadgeTone,
  type ButtonVariant,
  type Tone,
} from '@/ui';

/**
 * Lebendiger Styleguide: alle Bausteine aus `@/ui` mit ihren Varianten.
 * Erreichbar unter /styleguide – dient als Referenz für Entwicklung und Doku.
 */
const COLORS = ['brand', 'gray', 'danger', 'warning', 'info', 'accent'] as const;
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
const BUTTONS: ButtonVariant[] = ['primary', 'secondary', 'warning', 'accent', 'ghost'];
const ALERTS: Tone[] = ['success', 'danger', 'warning', 'info', 'neutral'];
const BADGES: BadgeTone[] = ['success', 'solid', 'danger', 'danger-soft', 'warning', 'warning-soft', 'info', 'info-soft', 'neutral', 'accent'];

export default function Styleguide() {
  const [segment, setSegment] = useState<'alle' | 'probleme' | 'eingeplant'>('alle');
  const [modal, setModal] = useState(false);

  return (
    <Page>
      <PageHeader title="Design-System" subtitle="Alle wiederverwendbaren Bausteine aus web/src/ui – Farben und Formen kommen aus den Design-Tokens." />

      <Block title="Farb-Tokens" hint="ui/styles/tokens.css · in Tailwind als brand-500, danger-50 … verfügbar">
        <div className="space-y-2">
          {COLORS.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <span className="w-16 text-xs font-medium text-gray-500">{c}</span>
              <div className="flex flex-1 overflow-hidden rounded-control border border-gray-200">
                {STEPS.map((s) => (
                  <div key={s} className="h-9 flex-1" style={{ background: `rgb(var(--color-${c}-${s}))` }} title={`${c}-${s}`} />
                ))}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="w-16 text-xs font-medium text-gray-500">route</span>
            <div className="flex flex-1 gap-1">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="h-9 flex-1 rounded-control" style={{ background: `rgb(var(--color-route-${i + 1}))` }} title={`route-${i + 1}`} />
              ))}
            </div>
          </div>
        </div>
      </Block>

      <Block title="Button" hint="variant · size · icon · block">
        <div className="flex flex-wrap items-center gap-3">
          {BUTTONS.map((v) => (
            <Button key={v} variant={v}>
              {v}
            </Button>
          ))}
          <Button variant="primary" icon="lock">
            mit Icon
          </Button>
          <Button size="sm">size sm</Button>
          <Button variant="primary" disabled>
            disabled
          </Button>
        </div>
      </Block>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Badge" hint="tone · strong">
          <div className="flex flex-wrap gap-2">
            {BADGES.map((t) => (
              <Badge key={t} tone={t}>
                {t}
              </Badge>
            ))}
          </div>
        </Block>

        <Block title="SegmentedControl">
          <SegmentedControl
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'alle', label: 'Alle (152)' },
              { value: 'probleme', label: 'Nur Probleme (14)' },
              { value: 'eingeplant', label: 'Eingeplant (118)' },
            ]}
          />
        </Block>
      </div>

      <Block title="Alert" hint="tone · size">
        <div className="space-y-2">
          {ALERTS.map((t) => (
            <Alert key={t} tone={t}>
              Alert „{t}“ – Hinweistext für die Planung.
            </Alert>
          ))}
          <Alert tone="danger" size="sm">
            Kompakte Variante (size=&quot;sm&quot;) für Fußleisten und Listen
          </Alert>
        </div>
      </Block>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block title="Field · Input · Textarea" hint="tone=error|warning · readOnly · size">
          <div className="space-y-4">
            <Field label="Adresse">
              <Input defaultValue="Grazbachgasse 12, 8010 Graz" />
            </Field>
            <div>
              <Field label="Breitengrad (lat)">
                <Input tone="error" placeholder="— fehlt —" />
              </Field>
              <FieldMessage tone="error">Koordinaten fehlen – die Adresse muss geokodiert werden.</FieldMessage>
            </div>
            <div>
              <Field label="Besichtigungstyp">
                <Input tone="warning" defaultValue="" placeholder="— fehlt —" />
              </Field>
              <FieldMessage tone="warning">Typ unbekannt – 105 min angenommen.</FieldMessage>
            </div>
            <Field label="Eingang der Anfrage" hint="Nicht bearbeitbar">
              <Input readOnly defaultValue="03.11.2026 09:12" />
            </Field>
            <Field label="Notiz">
              <Textarea rows={2} defaultValue="Zufahrt über Hinterhof" />
            </Field>
          </div>
        </Block>

        <Block title="Modal · Loading">
          <div className="space-y-4">
            <Button variant="primary" onClick={() => setModal(true)}>
              Dialog öffnen
            </Button>
            <Loading label="Routenplanung wird berechnet …" />
          </div>
        </Block>
      </div>

      {modal && (
        <Modal
          onClose={() => setModal(false)}
          eyebrow="An: Vertrieb / Planung"
          title="Beispiel-Dialog"
          footer={
            <>
              <Button onClick={() => setModal(false)}>Abbrechen</Button>
              <Button variant="primary" onClick={() => setModal(false)}>
                Bestätigen
              </Button>
            </>
          }
        >
          <p className="mt-3 text-sm text-gray-600">Mobil als Bottom-Sheet, ab „sm“ zentriert. Schließt mit Escape oder Klick daneben.</p>
        </Modal>
      )}
    </Page>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="mt-4 p-4 md:p-6">
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 font-mono text-xs text-gray-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
