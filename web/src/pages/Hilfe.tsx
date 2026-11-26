/**
 * @file      Hilfe.tsx – Seite: Hilfe & Annahmen für Planer (statischer Inhalt)
 * @layer     Web · View (Seite)
 * @siehe     docs/01-aufgabe-und-ergebnis.md · docs/10-code-navigation.md
 */
import { Link } from 'react-router-dom';
import { Card, Icon, Page } from '@/ui';

/**
 * Hilfe & Einarbeitung: Ablauf, Regeln, Status und typische Datenprobleme auf einer Seite.
 * Gedacht für neue Kolleginnen und Kollegen in der Planung – rein statischer Inhalt.
 */

const SECTIONS = [
  { id: 'annahmen', title: 'Annahmen' },
  { id: 'ablauf', title: 'Ablauf in 5 Schritten' },
  { id: 'regeln', title: 'Planungsregeln' },
  { id: 'status', title: 'Status & Symbole' },
  { id: 'entscheidungen', title: 'Eingriffe des Planers' },
  { id: 'datenprobleme', title: 'Datenprobleme lösen' },
  { id: 'notizen', title: 'Notizen aus dem Vertrieb' },
  { id: 'protokoll', title: 'Protokoll & Demo' },
  { id: 'wichtig', title: 'Gut zu wissen' },
];

const STEPS: { title: string; text: string; link?: { to: string; label: string } }[] = [
  {
    title: 'Übersicht prüfen',
    text: 'Die Übersicht zeigt den Planungszeitraum, wie viele Anfragen eingeplant sind und wo Handlungsbedarf besteht. Dort startest du jeden Tag.',
    link: { to: '/stammdaten', label: 'Zur Übersicht' },
  },
  {
    title: 'Handlungsbedarf abarbeiten',
    text: 'Datensätze mit fehlenden oder fehlerhaften Angaben können nicht eingeplant werden. Korrigiere sie in der Detailansicht und speichere – Prüfung und Routenplanung laufen danach automatisch neu.',
    link: { to: '/stammdaten/handlungsbedarf', label: 'Zum Handlungsbedarf' },
  },
  {
    title: 'Tag wählen und Routen prüfen',
    text: 'In der Routenplanung wählst du einen Tag und siehst alle Außendienstler mit ihrer Tagesroute, Fahrzeit und Auslastung. Ein Klick auf eine Person zeigt ihre Route auf der Karte, ein Klick auf einen Termin alle Details.',
    link: { to: '/planer', label: 'Zur Routenplanung' },
  },
  {
    title: 'Bei Bedarf eingreifen',
    text: 'Passt ein Vorschlag nicht, kannst du eine Anfrage verschieben, fixieren, vorziehen oder aus dem Plan nehmen. Das System plant die Woche danach neu und prüft das Ergebnis.',
  },
  {
    title: 'Routen freigeben',
    text: 'Passt alles, gibst du die Route einer Person oder alle Routen des Tages frei. Freigegebene Routen sind gesperrt: Reihenfolge und Zeiten bleiben bei jeder Neuplanung erhalten. Routen mit Regelverstoß lassen sich nicht freigeben.',
  },
];

const RULES: [string, string][] = [
  ['Arbeitstag', 'Liegt im Verfügbarkeitsfenster der Person und beginnt und endet am Wohnort.'],
  ['Termine und Anfahrt', 'Jeder Termin inklusive Anfahrt liegt ganz im Fenster. Nur die Heimfahrt darf bis zu 60 Minuten darüber hinausgehen.'],
  ['Mittagspause', '60 Minuten, Beginn zwischen 11:30 und 13:00 – nur an ganzen Tagen. Passt sie nicht, entfällt sie.'],
  ['Kundenzeit', '„Kunde verfügbar ab“ ist eine harte Grenze: Der Termin beginnt nie früher. Ohne Angabe gilt der Kunde als ganztägig verfügbar – kein Fehler, mit der Freigabe steht der Termin fest. Zeitangaben in Notizen sind Information für dich, keine Planungsregel.'],
  ['Zuständigkeit', 'Anfrage im Einsatzgebiet der Person, sonst Wohnort höchstens 15 km entfernt, sonst nicht zuordenbar.'],
  ['Fixe Termine', 'Bestehende Termine (z. B. Inbetriebnahmen, 4 Stunden) bleiben, wo sie sind. Die Route wird um sie herum geplant.'],
  ['Keine Überschneidungen', 'Nichts überlappt, auch nicht Fahrzeiten oder die Mittagspause.'],
  ['Reihenfolge bei Engpass', 'Reicht die Kapazität nicht, kommen ältere Anfragen zuerst. Jüngere landen auf der Warteliste.'],
  ['Dauer vor Ort', 'PV 60 min · WP 75 min · WP+PV 105 min · Typ unbekannt 105 min.'],
];

const STATUS: { label: string; cls: string; text: string }[] = [
  { label: 'Vorgeschlagen', cls: 'bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-200', text: 'Vom System eingeplant, noch nicht freigegeben. Kann sich bei einer Neuplanung noch ändern.' },
  { label: 'Freigegeben', cls: 'bg-brand-500 text-white', text: 'Route ist bestätigt und gesperrt. Die Anfrage wird zum Termin.' },
  { label: '📌 Fixiert', cls: 'bg-info-100 text-info-800', text: 'Vom Planer an Tag und Person gebunden – bleibt bei jeder Neuplanung dort.' },
  { label: '⇡ Vorgezogen', cls: 'bg-accent-100 text-accent-800', text: 'Wird vor älteren Anfragen eingeplant. Bewusste Ausnahme mit Begründung.' },
  { label: 'Vorgeplant KW …', cls: 'bg-info-100 text-info-800', text: 'Diese Woche ist voll – die Anfrage ist in einer Folgewoche vorgeplant (vorläufig, bis die echte Verfügbarkeit vorliegt).' },
  { label: 'Warteliste', cls: 'bg-warning-100 text-warning-800', text: 'Daten sind in Ordnung, aber die Kapazität der Woche reicht nicht. Kunde über die Verschiebung informieren.' },
  { label: 'Aus dem Plan genommen', cls: 'bg-gray-200 text-gray-700', text: 'Bleibt offen, wird aber nicht automatisch eingeplant, bis du sie wieder aufnimmst.' },
  { label: 'Nicht planbar', cls: 'bg-danger-50 text-danger-700 ring-1 ring-inset ring-danger-200', text: 'Datenfehler oder nicht zuordenbar. Erst korrigieren bzw. intern klären.' },
  { label: 'Bewusste Ausnahme', cls: 'bg-warning-50 text-warning-800 ring-1 ring-inset ring-warning-200', text: 'Gelb markiert: Eine Regel wurde mit Begründung übergangen. Die Route bleibt freigebbar.' },
  { label: 'Regelverstoß', cls: 'bg-danger-100 text-danger-700', text: 'Rot markiert: Die Route verletzt eine Regel und kann nicht freigegeben werden.' },
];

const SYMBOLS: [React.ReactNode, string][] = [
  [<span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">1</span>, 'Neu eingeplante Anfrage, Zahl = Reihenfolge in der Tagesroute'],
  [<span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-white"><Icon name="lock" className="h-3 w-3" /></span>, 'Fixer Termin – nicht verschiebbar'],
  [<span className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-brand-500 text-brand-600"><Icon name="home" className="h-3 w-3" /></span>, 'Wohnort der Person (Beginn und Ende des Arbeitstags)'],
  [<span className="flex gap-0.5"><span className="h-2 w-4 rounded-sm bg-brand-500" /><span className="h-2 w-3 rounded-sm bg-gray-400" /><span className="h-2 w-2 rounded-sm bg-gray-300" /></span>, 'Auslastung: vor Ort · Fahrt · Pause/Warten · frei'],
  [<span className="text-sm text-gray-500">≈ / ca.</span>, 'Geschätzte Fahrzeit (Luftlinie), keine echte Routenberechnung'],
];

const ACTIONS: [string, string][] = [
  ['Planung ändern …', 'Ein Button pro Anfrage. Er öffnet einen Dialog mit den Schritten, die gerade möglich sind – jeder mit einem Satz, was danach passiert.'],
  ['Verschieben / Manuell einplanen', 'Zeigt alle möglichen Tage und Personen, die besten zuerst – mit Uhrzeit und zusätzlicher Fahrzeit. Regelkonforme Optionen übernimmst du direkt; ein Regelbruch geht nur als bewusste Ausnahme mit Begründung.'],
  ['Fixieren', 'Hält einen Vorschlag an Tag und Person fest, z. B. wenn der Termin mit dem Kunden schon abgesprochen ist.'],
  ['Vorziehen', 'Zeigt, welche geplante Anfrage Platz machen könnte (Empfehlung zuerst, frei wählbar) inkl. Mehrfahrzeit gegenüber der optimalen Route. Nur regelkonforme Tausche, fixe Termine bleiben. Begründung ist Pflicht.'],
  ['Aus dem Plan nehmen', 'Für Anfragen, die gerade nicht besichtigt werden sollen (z. B. „Kunde ruft zurück“). Mit „Wieder aufnehmen“ rückgängig.'],
  ['Freigabe zurücknehmen', 'Entsperrt eine Route wieder für die Neuplanung – nur solange sie noch nicht veröffentlicht ist.'],
];

const PROBLEMS: [string, string][] = [
  ['Koordinaten fehlen', 'In der Anfrage „Koordinaten finden“ klicken, Ergebnis prüfen und speichern. Ohne Treffer beim Vertrieb nachfragen.'],
  ['Tippfehler in der Adresse', 'Adresse korrigieren (z. B. PLZ), Koordinaten neu ermitteln und speichern.'],
  ['Besichtigungstyp fehlt', 'Wird mit 105 Minuten eingeplant. Wenn bekannt, Typ nachtragen – dann stimmt die Dauer.'],
  ['Außerhalb aller Gebiete', 'Nicht zuordenbar (z. B. Innsbruck). Intern eskalieren: Vertretung aus einer Nachbarregion oder Gebiet erweitern.'],
  ['Person ohne Verfügbarkeit', 'Wird nicht eingeplant. In der Detailansicht Verfügbarkeit anfragen oder an den Vertrieb melden.'],
  ['Person ohne Einsatzgebiet', 'Bekommt nur Anfragen im Umkreis von 15 km um den Wohnort. Gebiet bestätigen lassen. Ist es abgesprochen, in der Detailansicht unter „Gebiet aus Vorlage übernehmen“ ein Gebiet wählen (z. B. Umkreis 50 km) und speichern – die Vorschau zeigt vorher, wie viele Anfragen im Gebiet liegen, danach wird sofort neu geplant.'],
  ['Passt in keinen Tag', 'Die Anfrage passt selbst an einem leeren Tag nicht (z. B. Kunde erst ab 17 Uhr, Termin 105 min, weite Anfahrt). Kein Kapazitätsproblem – mit Kunde bzw. Vertrieb eine andere Zeit klären.'],
  ['Freitext-Notizen', 'Stehen in der Tagesroute direkt beim Termin. Passt eine Uhrzeit nicht zur Notiz (z. B. „nur vormittags“), den Termin über „Planung ändern … → Verschieben“ anpassen.'],
];

/** Wo die Case Study Spielraum lässt: so wurde entschieden (gleicher Stand wie README „Bewusste Annahmen“) */
const ASSUMPTIONS: { group: string; rows: [string, string][] }[] = [
  {
    group: 'Kunde & Termin',
    rows: [
      ['„Kunde verfügbar ab“ fehlt', 'Kunde gilt als ganztägig verfügbar. Das Feld legt nur fest, dass ein Termin nicht früher beginnen darf – ohne Wert gibt es keine Untergrenze. Kein Datenfehler, sondern der Normalfall.'],
      ['„Kunde verfügbar ab“ im falschen Format', 'Eindeutige Schreibweisen wie „10.00“, „10 Uhr“ oder „1000“ werden als 10:00 gelesen und so geplant (gelbe Warnung, Korrektur per Klick). Nur wirklich unlesbare Werte (z. B. „25:99“, „morgens“) sind ein Datenfehler und „Nicht planbar“.'],
      ['Zeitwünsche in Notizen', 'Notizen sind Freitext und werden nicht automatisch ausgewertet – harte Grenze ist nur „Kunde verfügbar ab“. Die Notiz steht in der Tagesroute beim Termin; der Planer sieht sie beim Prüfen und verschiebt bei Bedarf. Bewusst ohne KI: Die Aufgabe ist, den Planer zu entlasten, nicht ihn zu ersetzen.'],
      ['Freigabe', 'Mit der Freigabe steht der Termin fest. Kunde und Außendienst werden informiert, eine erneute Bestätigung durch den Kunden ist nicht vorgesehen. Im Prototyp wird nur gespeichert, nichts versendet.'],
      ['Besichtigungstyp fehlt', 'Dauer 105 Minuten (Vorgabe der Case Study für „unbekannt“).'],
    ],
  },
  {
    group: 'Arbeitstag',
    rows: [
      ['Kein Verfügbarkeits-Eintrag', 'Person ist an dem Tag nicht verfügbar (laut API). Gesperrte Tage ebenso.'],
      ['Ganzer Tag', 'Fenster von mindestens 10 Stunden (z. B. 07:00–19:00). Nur dann gibt es eine Mittagspause; halbe Tage (07–12, 12–19) haben keine.'],
      ['Mittagspause passt nicht', 'Entfällt – laut Regel erlaubt, kein Verstoß. Aber nur, wenn schon fixe Termine sie verhindern: Für einen zusätzlichen Besuch wird die Pause nie geopfert.'],
      ['Abfahrt', 'So spät wie möglich, damit beim ersten Kunden niemand wartet – aber nie vor Fensterbeginn.'],
      ['Wartezeit', 'Kommt der Außendienst vor „Kunde verfügbar ab“ an, wartet er vor Ort. Die Wartezeit zählt zum Arbeitstag.'],
    ],
  },
  {
    group: 'Zuständigkeit',
    rows: [
      ['15-km-Regel', 'Luftlinie zwischen Wohnort und Kundenadresse.'],
      ['Überlappende Gebiete', 'Alle zuständigen Personen kommen in Frage; das System wählt die mit der geringsten Zusatz-Fahrzeit.'],
      ['Person ohne Gebiet', 'Bekommt nur Anfragen im 15-km-Umkreis des Wohnorts.'],
    ],
  },
  {
    group: 'Folgewochen (Vorplanung)',
    rows: [
      ['Verfügbarkeit Außendienst', 'Die Case-API liefert Verfügbarkeiten nur für diese Woche. In Produktion kämen die der Folgewochen ebenfalls aus der API; bis dahin wird angenommen, dass jede Person genauso verfügbar ist wie jetzt (gleiche Tage, Zeitfenster, Urlaube/Krankheit). Deshalb sind Folgewochen vorgeplant (vorläufig) und erst freigebbar, wenn die echte Verfügbarkeit vorliegt.'],
      ['Ablauf', 'Diese Woche wird gefüllt (ältere zuerst). Was keinen Platz hat, wird in die nächste Woche vorgeplant, der Rest in die übernächste usw. Neue Anfragen und fixe Termine der Folgewochen ändern die Vorplanung – sie wird bei jeder Änderung neu berechnet.'],
      ['Nicht enthalten', 'Anfragen mit Datenfehler, ohne zuständige Person oder aus dem Plan genommen – sie brauchen zuerst eine Entscheidung.'],
    ],
  },
  {
    group: 'Fahrzeit & Priorität',
    rows: [
      ['Fahrzeitquelle', 'Heizma-API (/travel/path), ohne Puffer und ohne Berufsverkehr; Hin- und Rückweg gelten als gleich lang. Mit „≈“ markierte Werte sind Luftlinien-Schätzungen.'],
      ['„Ältere zuerst“', 'Reihenfolge nach Eingang (createdAt). Nach der Routenoptimierung wird nachgeprüft: Könnte eine wartende ältere Anfrage regelkonform den Platz einer jüngeren einnehmen, wird getauscht. Eine jüngere bekommt also nur Plätze, in die keine wartende ältere passt (Ort, Zeitfenster, Dauer).'],
      ['Vorziehen / Tauschen', 'Nur mit Begründung; fixe Termine und freigegebene Routen werden nie verdrängt. Im Plan als bewusste Ausnahme sichtbar.'],
    ],
  },
];

export default function Hilfe() {
  return (
    <Page>
      <h1 className="page-title">Hilfe & Einarbeitung</h1>
      <p className="page-subtitle max-w-2xl">
        Alles, was du für die Wochenplanung der Besichtigungen brauchst: der Ablauf, die Regeln, die das System einhält, und was zu tun ist, wenn
        Daten fehlen. Das System schlägt vor – der Planer prüft und gibt frei.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr] lg:gap-10">
        {/* Inhaltsverzeichnis */}
        <nav className="lg:sticky lg:top-[96px] lg:self-start" aria-label="Inhalt">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Inhalt</p>
          <ol className="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="block rounded-lg px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200 transition hover:bg-brand-50 hover:text-brand-700 lg:ring-0">
                  <span className="mr-2 text-gray-400">{i + 1}.</span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-6">
          <Section id="annahmen" title="Annahmen" hint="Wo die Case Study Spielraum lässt, gelten diese Festlegungen – in Planung und Prüfung gleich.">
            <div className="space-y-5">
              {ASSUMPTIONS.map((a) => (
                <div key={a.group}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">{a.group}</p>
                  <Table rows={a.rows} head={['Fall', 'Annahme']} />
                </div>
              ))}
            </div>
          </Section>

          <Section id="ablauf" title="Ablauf in 5 Schritten">
            <ol className="space-y-4">
              {STEPS.map((s, i) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">{i + 1}</span>
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="mt-0.5 text-sm text-gray-600">{s.text}</p>
                    {s.link && (
                      <Link to={s.link.to} className="mt-1 inline-block text-sm font-medium text-brand-600 hover:underline">
                        {s.link.label} →
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </Section>

          <Section id="regeln" title="Planungsregeln" hint="Das System hält diese Regeln automatisch ein und prüft jeden Plan unabhängig nach („✓ 0 Regelverstöße“).">
            <Table rows={RULES} head={['Regel', 'Bedeutung']} />
          </Section>

          <Section id="status" title="Status & Symbole">
            <ul className="divide-y divide-gray-100">
              {STATUS.map((s) => (
                <li key={s.label} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:gap-4">
                  <span className={`w-fit shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold sm:w-48 sm:text-center ${s.cls}`}>{s.label}</span>
                  <span className="text-sm text-gray-600">{s.text}</span>
                </li>
              ))}
            </ul>
            <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-gray-400">Karte & Liste</p>
            <ul className="space-y-2">
              {SYMBOLS.map(([icon, text], i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-gray-600">
                  <span className="flex w-12 shrink-0 justify-center">{icon}</span>
                  {text}
                </li>
              ))}
            </ul>
          </Section>

          <Section id="entscheidungen" title="Eingriffe des Planers" hint="Jeder Eingriff wird im Änderungsprotokoll der Anfrage festgehalten. Regelbrüche sind möglich, aber nie unsichtbar.">
            <Table rows={ACTIONS} head={['Aktion', 'Wann und wie']} />
          </Section>

          <Section id="datenprobleme" title="Datenprobleme lösen" hint="Fehlerhafte Daten werden nie stillschweigend eingeplant. Sie stehen unter „Handlungsbedarf“ und sind in der Detailansicht rot bzw. gelb markiert.">
            <Table rows={PROBLEMS} head={['Problem', 'Was tun?']} />
          </Section>

          <Section id="notizen" title="Notizen aus dem Vertrieb" hint="Freitext – wird angezeigt, nicht ausgewertet.">
            <p className="text-sm text-gray-600">
              Die Notiz steht in der Tagesroute direkt beim Termin und in der Anfrage. Zufahrt, Tiere oder „vorher anrufen“ betreffen den Außendienst; steht dort ein Zeitwunsch
              (z. B. „nur vormittags“), prüfst du die Uhrzeit und verschiebst bei Bedarf. Harte Grenze für die Planung ist nur das Feld „Kunde verfügbar ab“.
            </p>
          </Section>

          <Section id="protokoll" title="Protokoll & Demo" hint="Beides findest du im Zahnrad oben rechts.">
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>
                <strong className="text-ink">Aktivitätsprotokoll:</strong> zeigt, wann welche Route freigegeben, welche Anfrage verschoben, fixiert oder
                vorgezogen, was eskaliert und welche Daten korrigiert wurden – mit Begründung. Filterbar nach Bereich und durchsuchbar.{' '}
                <Link to="/protokoll" className="font-medium text-brand-600 hover:underline">
                  Zum Protokoll →
                </Link>
              </li>
              <li>
                <strong className="text-ink">Demo zurücksetzen:</strong> löscht alle lokalen Korrekturen, Freigaben, Eingriffe, Eskalationen und das
                Protokoll. Die Planung startet wieder mit den Originaldaten der Heizma-API – ideal für einen neuen Testlauf.
              </li>
            </ul>
          </Section>

          <Section id="wichtig" title="Gut zu wissen">
            <ul className="list-disc space-y-2 pl-5 text-sm text-gray-600">
              <li>
                <strong className="text-ink">Kein Rückgängig nach der Veröffentlichung.</strong> Sind Kunden und Außendienst bereits informiert, laufen
                Änderungen über den normalen Umplanungsprozess.
              </li>
              <li>
                <strong className="text-ink">Korrekturen</strong> werden lokal gespeichert und sofort in Prüfung und Routenplanung übernommen. Mit
                „Original wiederherstellen“ gilt wieder der Stand aus der Heizma-API.
              </li>
              <li>
                <strong className="text-ink">Nachrichten</strong> an Kunden, Außendienst oder Vertrieb werden im Prototyp nur gespeichert und markiert,
                nicht versendet.
              </li>
              <li>
                <strong className="text-ink">Fahrzeiten</strong> stammen aus der Heizma-Fahrzeitquelle. Mit „≈“ markierte Werte sind Schätzungen.
              </li>
            </ul>
          </Section>
        </div>
      </div>
    </Page>
  );
}

function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card as="section" id={id} className="scroll-mt-[96px] p-4 md:p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-gray-500">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function Table({ rows, head }: { rows: [string, string][]; head: [string, string] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase tracking-wider text-gray-400">
        <tr>
          <th className="w-1/3 pb-2 pr-4 font-semibold">{head[0]}</th>
          <th className="pb-2 font-semibold">{head[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100 align-top">
        {rows.map(([a, b]) => (
          <tr key={a}>
            <td className="py-2.5 pr-4 font-medium text-ink">{a}</td>
            <td className="py-2.5 text-gray-600">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
