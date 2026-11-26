[← 9 Setup](09-setup.md) · **10 Code-Navigation** · [Übersicht ↑](../README.md)

# Code-Navigation – Kommentare, Marker und wo was steht

Für alle, die den Code übernehmen oder reviewen: Jede Quelldatei hat einen einheitlichen Kopf, größere Dateien sind in Abschnitte gegliedert, und wichtige Stellen tragen suchbare Tags. So findet man mit einem `grep` jede Case-Regel, jede Annahme und jeden bewussten Kompromiss.

## Schnellstart

```bash
npm run code:index              # Landkarte: jede Datei mit Zweck + alle Abschnitte mit Zeilennummer
npm run code:index -- tags      # Wie oft kommt welcher Tag in welcher Datei vor?
npm run code:index -- REGEL-3   # Alle Stellen zur Mittagspause: Umsetzung, Prüfung, Test (geht mit jedem Tag)
npm run check:code-index        # Konventionen prüfen – läuft auch in der CI bei jedem Push
grep -rn "REGEL-5" api/src      # Ohne Node: Zuständigkeit (Gebiet / 15 km)
```

Das Skript ([`scripts/code-index.mjs`](../scripts/code-index.mjs)) liest die Marker live aus dem Code. Zeilennummern veralten deshalb nie.

## 1 · Dateikopf

Jede Datei in `api/src`, `web/src` und `scripts` beginnt so:

```ts
/**
 * @file      planner.ts – Kern der Einsatzplanung (Anfragen → Personen-Tage → Tagesrouten)
 * @layer     Backend · Domäne (reine Funktionen, kein I/O)
 * @einstieg  buildPlan() · rankOptions() · swapOptions() · forecast()
 * @nutzt     travelMatrix, validation, timeWish
 * @genutzt   index.ts, verify.ts
 * @siehe     docs/03-planung-und-regeln.md · docs/10-code-navigation.md
 */
```

| Feld | Bedeutung | Pflicht |
|---|---|---|
| `@file` | Dateiname – Zweck in einem Satz | ja |
| `@layer` | Schicht (siehe [Architektur](02-architektur.md)): *Domäne* = reine Logik, *Infrastruktur* = I/O, *Schnittstelle*, *View*, *Core*, *Modul-Interactor*, *Design-System* | ja |
| `@siehe` | passende Doku-Seite | ja |
| `@einstieg` | Funktionen, mit denen man beim Lesen anfängt | bei Kerndateien |
| `@nutzt` / `@genutzt` | wichtigste Abhängigkeiten in beide Richtungen | bei Kerndateien |
| `@route` | URL der Seite | bei Seiten |

## 2 · Abschnitte: `// MARK: -`

Aus Swift/Xcode übernommen. **VS Code** zeigt `// MARK:`-Zeilen als Überschriften in der Minimap (Einstellung `editor.minimap.showMarkSectionHeaders`, standardmäßig an). In der Gliederung (Outline) bleiben die Funktionen.

```ts
// MARK: - Tages-Simulation        ← Hauptabschnitt einer Datei
  // MARK: Phase 2 – Greedy         ← Unterabschnitt innerhalb einer Funktion (ohne Bindestrich)
{/* MARK: - Sidebar */}             ← in JSX
```

## 3 · Tags in Kommentaren

Tags stehen am Anfang eines Kommentars, in GROSSBUCHSTABEN, mit Doppelpunkt. Mehrere werden mit `·` verbunden: `// REGEL-3 · ANNAHME: …`

| Tag | Wofür | Beispiel |
|---|---|---|
| `REGEL-1` … `REGEL-8` | Hier wird eine Regel aus der Case Study umgesetzt oder geprüft (Nummern wie in [Planung & Regeln](03-planung-und-regeln.md#die-regeln--umsetzung-und-nachweis)) | `// REGEL-2: Heimfahrt max. +60 min` |
| `DATEN:` | Umgang mit absichtlich unsauberen Daten | fehlende Koordinaten, Typ `null`, Uhrzeit „10.00“ |
| `ANNAHME:` | Bewusste Auslegung, wo die Aufgabe offen ist | „ganzer Tag“ = Fenster ≥ 10 h |
| `TRADE-OFF:` | Bewusster Kompromiss – mit Begründung | Heuristik statt Solver |
| `ACHTUNG:` | Stolperfalle beim Ändern | Cache-Schlüssel, Endlosschleifen-Schutz |
| `SICHERHEIT:` | Token, Login, Datenschutz | Heizma-Token bleibt auf dem Server |
| `KI:` | Stelle mit KI – und wo der Mensch entscheidet | Notizen → Vorschläge |
| `AUSBLICK:` | Was mit mehr Zeit käme (Detail in [Trade-offs & Ausblick](08-trade-offs-und-ausblick.md)) | OR-Tools, CRM statt JSON |
| `EINSTIEG` | Öffentliche Haupt-Funktion eines Moduls | `buildPlan` |
| `GRUND-PRAEFIX` | Code prüft den Anfang eines Wartelisten-Grunds per `startsWith`/Regex – siehe [Warteliste-Gründe](#8--warteliste-gründe) | `reason.startsWith('Kapazität')` |

## 4 · Regel-Index: wo jede Regel lebt

Jede Regel steht an drei Stellen: **umgesetzt** im Planer, **unabhängig nachgerechnet** in der Prüfung und **abgesichert** durch mindestens einen Test in `api/src/__tests__/planner.test.ts`. Die CI bricht ab, wenn eine der drei Markierungen fehlt.

| # | Regel | Umsetzung | Prüfung (`verify.ts`, Schlüssel) |
|---|---|---|---|
| 1 | Tag im Fenster, Start/Ende Wohnort | `planner.ts` → `simulate()` | `window` |
| 2 | Termin inkl. Anfahrt im Fenster, Heimfahrt ≤ +60 | `planner.ts` → `simulate()`, `RULES.RETURN_TOLERANCE` | `window`, `returnHome` |
| 3 | Mittagspause 60 min, Beginn 11:30–13:00, nur ganze Tage | `planner.ts` → `simulate()` (zwei Stellen + „hat Vorrang“) | `lunch` |
| 4 | `customerAvailableFrom` hart | `planner.ts` → `requestToItem()` + `simulate()` | `customerFrom` |
| 5 | Zuständigkeit: Gebiet → ≤ 15 km → nicht zuordenbar | `validation.ts` → `eligibleTechnicians()` | `responsibility` |
| 6 | Fixe Termine bleiben | `planner.ts` → `appointmentToItem()`, Relocate überspringt sie | `fixed` |
| 7 | Keine Überlappung inkl. Fahrzeit | `planner.ts` → `simulate()` (lückenlose Zeitkette) | `travel` |
| 8 | Ältere zuerst | `planner.ts` → `buildPlan()` Phase 2, 4, 4b | `priority` |

`npm run code:index -- REGEL-<n>` springt zu allen Fundstellen.

## 5 · Lesepfade

**Planungslogik verstehen (≈ 30 min):**
1. [`api/src/types.ts`](../api/src/types.ts) – das Datenmodell
2. [`api/src/planner.ts`](../api/src/planner.ts) – `RULES` → `simulate()` → `buildPlan()` (Phasen per `MARK: Phase …`)
3. [`api/src/verify.ts`](../api/src/verify.ts) – wie das Ergebnis nachgeprüft wird
4. [`api/src/__tests__/planner.test.ts`](../api/src/__tests__/planner.test.ts) – Beispiele für jede Regel

**Ein Request von Klick bis Antwort (Beispiel „Route freigeben“):**
`pages/Planner.tsx` → `core/CoreInteractor.ts` (`approveRoute` → `mutate`) → `modules/routen/RoutenInteractor.ts` → `core/ApiService.ts` → `POST /api/approvals` in `api/src/index.ts` → `localStore.ts` (`approveRoutes`) → neue Revision → `getPlan()` plant neu → Web lädt alles Sichtbare neu.

**Unsaubere Daten:** `npm run code:index -- DATEN`, dazu [`validation.ts`](../api/src/validation.ts) (alle Befund-Codes) und [Datenqualität](04-datenqualitaet.md).

## 6 · Datei-Landkarte

### Backend (`api/src`)

| Datei | Schicht | Zweck |
|---|---|---|
| `index.ts` | Schnittstelle | Alle `/api/*`-Endpunkte, Plan-Cache, Fehlerbehandlung |
| `planner.ts` | Domäne | Planung: Simulation, Greedy, 2-opt/Relocate, Tausch, Vorschauen, Prognose |
| `verify.ts` | Domäne | Unabhängige Regelprüfung + bewusste Ausnahmen |
| `validation.ts` | Domäne | Datenbefunde (error/warning/info) + Zuständigkeit |
| `timeWish.ts` | Domäne | Zeitwünsche aus Notizen (regelbasiert) |
| `geo.ts` · `time.ts` | Domäne | Distanz, Polygon, Fahrzeit-Schätzung · Uhrzeiten |
| `types.ts` | Typen | Gemeinsames Modell für API und Web |
| `heizmaClient.ts` | Infrastruktur | Heizma-API bzw. Fixtures (einzige Stelle mit Token) |
| `travelMatrix.ts` | Infrastruktur | Fahrzeitmatrix aus `/travel/path`, Datei-Cache |
| `localStore.ts` | Infrastruktur | Korrekturen, Freigaben, Entscheidungen, Protokoll (JSON) |
| `geocode.ts` · `towns.ts` | Infrastruktur | Geocoding mit Offline-Fallback |
| `notesAi.ts` | Infrastruktur | KI-Hinweise aus Notizen (optional) |
| `config.ts` | Infrastruktur | `.env`-Konfiguration |
| `mockauth/*` | Auth | Login, Token, `requireAuth` |

### Frontend (`web/src`)

Abhängigkeiten zeigen nur nach unten: **View → Core → Modul-Interactor → ApiService**. Der [Architektur-Wächter](06-tests-und-qualitaet.md) erzwingt das.

| Ordner | Inhalt |
|---|---|
| `pages/` | Seiten (eine pro Route) – `Planner.tsx` ist die Hauptansicht |
| `components/`, `components/planner/`, `components/stammdaten/` | View-Bausteine je Bereich |
| `core/` | `CoreInteractor` (Fassade), `ApiService` (einziges `fetch`), `Resource`/`useResource`, Auth |
| `modules/<bereich>/` | Ein Interactor + Typen je Fachbereich: anfragen · routen · techniker · termine · system |
| `lib/` | Reine Helfer (Formatierung, Regionen, Typ-Re-Export) |
| `ui/` | Design-System: Tokens, Komponenten-Klassen, React-Bausteine |

Die vollständige Liste mit Zweck jeder Datei liefert `npm run code:index`.

## 7 · In der Pipeline (GitHub Actions)

Bei jedem Push und Pull Request ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)):

| Schritt | Was passiert |
|---|---|
| `npm run check:code-index` | **Gate** – der Build schlägt fehl, wenn eine Datei keinen Kopf (`@file`, `@layer`, `@siehe`) hat, eine Regel `REGEL-1…8` nicht in Umsetzung, Prüfung **und** Test markiert ist, eine unbekannte Regelnummer auftaucht (Tippfehler) oder ein Tag hier nicht dokumentiert ist |
| `npm run code:index -- tags` | Tag-Übersicht im Log und in der **Job-Zusammenfassung** |
| `npm run code:index` | Vollständige Landkarte als Artefakt `code-index` (Datei `code-index.txt`) zum Herunterladen |

Lokal läuft dasselbe Gate in `npm run check`.

## 8 · Warteliste-Gründe

`buildPlan()` begründet jede nicht eingeplante Anfrage mit einem Text, dessen **Anfang** maschinell ausgewertet wird (Status-Chip, Wartelisten-Gruppe, Prognose, Prüfung). Diese Stellen tragen den Tag `GRUND-PRAEFIX`.

| Präfix | Bedeutung | Nächste Aktion |
|---|---|---|
| `Kapazität erschöpft` | Passt grundsätzlich, aber diese Woche ist kein Platz – zählt für „ältere zuerst“ (REGEL-8) | Kunde informieren / Prognose |
| `Passt in keinen Tag` | Passt selbst an einem leeren Tag nicht (z. B. Kunde erst ab 17 Uhr + weite Anfahrt) | Andere Zeit mit Kunde/Vertrieb klären |
| `Zeitwunsch klären` | Notiz enthält einen Zeitwunsch, noch nicht bestätigt | Bestätigen oder verwerfen |
| `Aus dem Plan genommen` | Planer hat sie bewusst herausgenommen | – |
| `Datenfehler` · `Keine Koordinaten` | Daten zuerst korrigieren | Stammdaten bearbeiten / geokodieren |
| `Nicht zuordenbar` | Außerhalb aller Gebiete und > 15 km (REGEL-5) | Eskalation an den Vertrieb |
| `Zuständige Außendienstler ohne Verfügbarkeit` | Zuständige Person hat diese Woche keinen Tag | Techniker-Eskalation |
| `Fixierung nicht möglich` | Fixierter Tag ist nicht verfügbar oder schon freigegeben | Anderen Tag wählen |

**Neuen Grund einführen:** Text in `planner.ts` → dann `npm run code:index -- GRUND-PRAEFIX` und jede Fundstelle prüfen (mindestens `Waitlist.tsx` → `ORDER`).

## 9 · Regeln für neue Kommentare

- **Warum statt was.** Der Code sagt, *was* passiert. Kommentare erklären Absicht, Annahme oder Risiko.
- **Neue Datei → Kopf anlegen** (mindestens `@file`, `@layer`, `@siehe`).
- **Regel, Annahme oder Kompromiss berührt → Tag setzen**, damit `code:index` sie findet.
- **Neuer Test → Regel-Tag darüber** (`// REGEL-4`), damit der Regel-Index vollständig bleibt.
- **Neuer Tag?** In `scripts/code-index.mjs` → `TAGS` ergänzen und hier in der Tag-Tabelle dokumentieren – sonst schlägt die CI fehl.
- **Kommentare auf Deutsch**, Bezeichner im Code auf Englisch (wie bisher).
- Neuer Endpunkt: in den passenden `MARK`-Abschnitt von `index.ts` und in die [API-Referenz](07-api.md).

---

[← 9 Setup](09-setup.md) · [Übersicht ↑](../README.md)
