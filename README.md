# Heizma · Einsatz- & Routenplanung (Case Study)

Prototyp für die **Routenoptimierung-Case-Study** von Heizma: offene Besichtigungs-Anfragen werden automatisch auf Außendienstler und Tage verteilt, pro Person entsteht eine fahrzeitoptimierte Tagesroute. Der Planer soll nur noch **draufschauen und freigeben**, statt selbst zu rechnen.

> Status: **Scaffold / erster Entwurf.** Datenanbindung, Validierung, ein erster Planungs-Algorithmus und die beiden Hauptansichten stehen. Fahrzeiten werden in der Planung noch geschätzt (siehe [Nächste Schritte](#nächste-schritte)).

---

## Inhalt

- [Schnellstart](#schnellstart)
- [Architektur](#architektur)
- [Funktionen](#funktionen)
- [Planungsregeln](#planungsregeln)
- [Umgang mit unsauberen Daten](#umgang-mit-unsauberen-daten)
- [API-Endpunkte](#api-endpunkte)
- [Projektstruktur](#projektstruktur)
- [Trade-offs & bekannte Vereinfachungen](#trade-offs--bekannte-vereinfachungen)
- [Nächste Schritte](#nächste-schritte)

---

## Schnellstart

### Voraussetzungen

- **Docker** (empfohlen) **oder** Node.js **≥ 22.9**
- Token für die Case-Study-API (kommt per Mail mit der Einladung)

### 1. Konfiguration

```bash
cp .env.example .env
# HEIZMA_API_TOKEN in .env eintragen
```

**Karte:** Mit `GOOGLE_MAPS_API_KEY` (Maps JavaScript API, [Key erstellen](https://console.cloud.google.com/google/maps-apis/credentials)) wird Google Maps verwendet, ohne Key automatisch Leaflet mit freien Kacheln.

Ohne Token oder offline: `DATA_SOURCE=mock` setzen – dann werden die Beispieldaten aus `api/src/fixtures` verwendet (gleiches Schema, gleiche Datenprobleme in klein).

### 2a. Start mit Docker

```bash
docker compose up --build
```

- Web-App: http://localhost:8080
- API: http://localhost:4000/api/health

### 2b. Lokale Entwicklung (ohne Docker)

```bash
npm install
npm run dev
```

- Web-App (Vite, Hot Reload): http://localhost:5173
- API (tsx watch): http://localhost:4000 – `/api` wird vom Vite-Dev-Server automatisch weitergeleitet

Weitere Befehle:

| Befehl | Zweck |
|---|---|
| `npm run typecheck` | TypeScript-Prüfung für API und Web |
| `npm run build` | Produktions-Build beider Pakete |

---

## Anmeldung (Mock-Auth)

Die App ist durch einen fest hinterlegten Mock-Login geschützt – keine externen Calls, keine Datenbank (`api/src/mockauth/`).

- **E-Mail:** `planner@heizma.at` · **Passwort:** `1nvite0nly`
- Zugangsdaten und Laufzeit über `MOCK_AUTH_EMAIL`, `MOCK_AUTH_PASSWORD`, `MOCK_AUTH_TTL_HOURS` (Standard 2 h)
- Token wird nur im `sessionStorage` gehalten → gilt pro Browser-Sitzung/Tab
- Zustandsloses HMAC-signiertes Token (funktioniert auch serverless auf Vercel); Schlüssel optional über `MOCK_AUTH_SECRET`
- Alle `/api/*`-Routen außer `/api/health` und `/api/auth/*` verlangen `Authorization: Bearer <token>`

## Architektur

```
┌────────────────────┐      /api/*      ┌──────────────────────┐   Bearer-Token   ┌─────────────────────────┐
│  web (React/Vite)  │ ───────────────▶ │  api (Node/Express)  │ ───────────────▶ │ Heizma Case-Study-API   │
│  Tailwind, Leaflet │                  │  Cache · Validierung │                  │ (read-only, eingefroren)│
│  nginx im Docker   │ ◀─────────────── │  Planer · Geometrie  │ ◀─────────────── │                         │
└────────────────────┘                  └──────────────────────┘                  └─────────────────────────┘
```

- **Token bleibt serverseitig.** Das Frontend spricht nur mit der eigenen API, nie direkt mit Heizma.
- **Caching:** Der Datenstand ist eingefroren – Antworten werden im Speicher gecacht (`CACHE_TTL_SECONDS`), Straßengeometrien pro Route ebenfalls.
- **Eine Quelle für Typen:** `api/src/types.ts` wird vom Frontend direkt importiert.
- **Stack:** TypeScript durchgehend · Express · React 18 · Vite · Tailwind CSS · React Router · Google Maps (`@vis.gl/react-google-maps`), Fallback Leaflet ohne API-Key.

---

## Funktionen

### 1. Stammdaten (`/stammdaten`)

- **KPI-Kacheln:** eingeplante vs. offene Anfragen, Handlungsbedarf (Techniker / Anfragen / Termine), fixe Termine, verfügbare Techniker & Einsatztage.
- **Index-Karten** je Bereich: Anfragen, Außendienst, fixe Termine, Verfügbarkeiten, Handlungsbedarf – jeweils mit Anzahl der zu prüfenden Datensätze.
- **Hilfe & Einarbeitung** (`/hilfe`, im Menü statt „Handlungsbedarf“, der über die Übersicht erreichbar bleibt): Ablauf in 5 Schritten, Planungsregeln, Status & Symbole, Eingriffe des Planers und Lösungen für typische Datenprobleme – für neue Kolleginnen und Kollegen in der Planung.
- **Listen** mit Suche, Filter „Nur Probleme“ und Status-Spalte (OK / Warnung / Fehler).
- **Detail-/Bearbeitungsansicht:** fehlerhafte Felder sind rot bzw. gelb markiert, inkl. Begründung. Korrekturen werden per `PATCH` gespeichert und fließen sofort in Prüfung & Routenplanung ein (siehe „Lokale Korrekturen“).

### 2. Routenplanung (`/planer`, grüner Button oben rechts)

- Layout angelehnt an Google Maps: **Sidebar links, Karte rechts.**
- **Tages-Tabs** mit Anzahl der Stopps pro Tag.
- **Techniker-Zellen:** Anzahl Stopps, neue vs. fixe Termine, Fahrzeit, Arbeitsfenster; gesperrte Personen bzw. Personen ohne Verfügbarkeit ausgegraut.
- **Klick auf eine Person:** Route auf der Karte (Start & Ende am Wohnort), nummerierte Stopps, Tagesablauf mit Abfahrt, Ankunftszeiten, Wartezeiten, Mittagspause und Heimfahrt.
- **Hover** über Stopp (Karte oder Liste): Ankunftszeit, Terminfenster, Adresse.
- **Plan-Prüfung:** Badge „✓ 0 Regelverstöße · 10 Regeln“ – aufklappbar mit jeder Regel, Anzahl Einzelprüfungen und Hinweisen. Verstöße springen per Klick zur betroffenen Route, Stopps werden rot markiert.
- **Kennzahlen:** eingeplant, Gesamtfahrzeit inkl. Ersparnis durch Optimierung (Greedy → 2-opt/Relocate), Ø Anfahrt pro Besuch, Freigaben, Quelle der Fahrzeiten. Geschätzte Fahrten sind mit „≈“ markiert.
- **Freigabe:** pro Route oder „alle Routen des Tages freigeben“. Freigegebene Routen sind serverseitig gespeichert und **gesperrt** – Reihenfolge und Zeiten bleiben bei jeder Neuplanung erhalten. Routen mit Regelverstoß sind nicht freigebbar. Export als **.ics** (Kalender) für den Außendienst.
- **Kartenlegende:** **Kreis** in Technikerfarbe = neu eingeplante Anfrage (wird mit der Freigabe zum Termin) · **dunkles Quadrat mit Schloss** = bestehender fixer Termin (nicht verschiebbar).

> **Annahme – Benachrichtigung bei Freigabe:** Mit „Route freigeben“ würden in Produktion automatisch die **Kunden** (Terminbestätigung mit Datum und Zeitfenster) und die **Außendienstler** (Tagesroute / Kalendereintrag) benachrichtigt. Im Prototyp wird nur die Freigabe gespeichert – es werden keine Nachrichten versendet.

> **Bewusst nicht umgesetzt – kein Rückgängig nach der Veröffentlichung:** Ist eine Route freigegeben und veröffentlicht, sind Kunden und Außendienst in Produktion bereits informiert. Ein „Rückgängig“-Button würde dann Absagen bzw. Storno-Nachrichten und eine erneute Terminabstimmung erfordern – das ist nicht implementiert. Änderungen an veröffentlichten Terminen laufen über den normalen Umplanungsprozess. „Freigabe zurücknehmen“ im Prototyp entsperrt nur die Route für die Neuplanung und verschickt nichts.

> **Zum Testen – Planungsstand zurücksetzen:** In der Routenplanung unter der Überschrift „Test: Planungsstand zurücksetzen“ (oder `POST /api/local-db/reset?scope=planning`). Gelöscht werden alle Freigaben, Planer-Entscheidungen (fixiert, vorgezogen, aus dem Plan genommen), bestätigte Notiz-Hinweise und Eskalationen. **Datenkorrekturen bleiben erhalten**, die Woche wird sofort neu geplant. Ein kompletter Reset inkl. Korrekturen: `POST /api/local-db/reset`.
- **KI-Hinweise aus Notizen:** Chips wie „Vorher anrufen“, „Nur vormittags“. Zeit-Hinweise lassen sich mit einem Klick als harte Regel übernehmen (Mensch entscheidet).
- **Warteliste** mit allen nicht eingeplanten Anfragen, gruppiert nach Grund.

### 3. Eingriffe des Planers – „Das System schlägt vor, der Planer entscheidet“

Auf jeder Anfrage-Seite (`/stammdaten/anfragen/:id`) und im Stopp-Dialog des Planers gibt es dieselbe Karte **„Planung“** (gleiche Endpunkte, gleiche Logik):

- **Status:** Vorgeschlagen · 📌 Manuell fixiert · Warteliste (Platz X von Y) · Aus Plan genommen · Nicht planbar (mit Grund) · Termin (freigegeben).
- **Verschieben … / Einplanen …:** keine leeren Dropdowns, sondern eine **sortierte Liste aller Außendienst-Tage** – regelkonforme zuerst, mit voraussichtlicher Uhrzeit und Zusatz-Fahrzeit. Regelbrüche stehen gelb mit Grund daneben („Fixer Termin um 10:30 nicht mehr erreichbar“), freigegebene Touren sind gesperrt.
- **Vorschau vor dem Übernehmen:** neue vs. bisherige Route, Fahrzeit-Differenz, verletzte Regeln. Nach dem Übernehmen wird die ganze Woche neu geplant und unabhängig geprüft – die Rückmeldung kommt aus dem **tatsächlichen Ergebnis**, nicht aus der Vorschau.
- **📌 Fixieren:** Anfrage bleibt bei Neuplanung an diesem Tag und bei dieser Person.
- **Aus Plan nehmen** (mit Grund, z. B. „Kunde ruft zurück“) und **Wieder aufnehmen**.
- **⇡ Vorziehen** von der Warteliste: bricht „ältere zuerst“ bewusst – Hinweis „N ältere Anfragen warten noch“, Begründung Pflicht.
- **Änderungsprotokoll** je Anfrage: was, wann, warum.

**Datenfehler sperren die Planung – auch manuell.** Eine Anfrage mit Fehler (rot: fehlende Koordinaten, nicht zuordenbar, ungültige Uhrzeit …) wird nie eingeplant, auch nicht als Ausnahme. Nach der Korrektur (Adresse, Koordinaten, fehlende Daten) und „Speichern“ laufen Prüfung und Plan neu – die Anfrage wird automatisch eingeplant. Warnungen (z. B. Typ unbekannt → 105 min) blockieren nicht. In der Anfragenliste zeigt die Spalte **Plan** den Stand je Anfrage (Tag · Person, Warteliste, Nicht planbar), Filter „Eingeplant“.

**Regelbrüche: erlaubt, aber nie unsichtbar.** Der Planer bleibt nie in der UI stecken. Ein Regelbruch geht nur mit „Trotzdem einplanen“ + Begründung. Die Plan-Prüfung führt ihn dann als **bewusste Ausnahme (gelb)** statt als Fehler (rot); Touren mit Ausnahmen sind freigebbar, Touren mit echten Fehlern nicht. Ein Regelbruch ohne bestätigte Ausnahme bleibt immer rot.

> **Annahme – Anfrage wird Termin:** Mit der Freigabe einer Route würden in Produktion die Anfragen im Heizma-Backend zu Terminen. Im Prototyp ist das simuliert: Freigegebene Anfragen verschwinden aus „Offene Anfragen“ und erscheinen unter „Termine“ („aus Freigabe“). „Freigabe zurücknehmen“ macht sie wieder zu Anfragen.

| Endpunkt | Zweck |
| --- | --- |
| `GET /api/requests/:id/planning` | Status, Route, Warteliste, Entscheidung, Verstöße/Ausnahmen, Protokoll |
| `GET /api/requests/:id/options` | Mögliche Techniker-Tage, sortiert (Vorschau, ändert nichts) |
| `POST /api/requests/:id/decision` | `{ mode: pin \| exclude \| prioritize, technicianId?, date?, reason, override? }` |
| `DELETE /api/requests/:id/decision` | Entscheidung zurücknehmen → wieder automatisch geplant |
- Heizma-Firmensitz als Referenzpunkt auf der Karte.

---

## Planungsregeln

Umgesetzt in `api/src/planner.ts`, unabhängig nachgeprüft in `api/src/verify.ts`:

1. Arbeitstag liegt im Verfügbarkeitsfenster und beginnt/endet am **Wohnort**.
2. Jeder Termin **inkl. Anfahrt** liegt im Fenster; nur die Heimfahrt darf bis **60 min** darüber hinaus.
3. **Mittagspause** 60 min, Beginn 11:30–13:00, nur an ganzen Tagen; passt sie nicht, entfällt sie.
4. `customerAvailableFrom` ist eine **harte Grenze** (früher ankommen → Wartezeit).
5. **Zuständigkeit:** Anfrage im Einsatzgebiet (Punkt-in-Polygon) → sonst Wohnort ≤ 15 km → sonst *nicht zuordenbar*.
6. **Fixe Termine** bleiben, wo sie sind, und sind Stopps der Route.
7. **Keine Überschneidungen**, auch nicht der Fahrzeiten.
8. Reicht die Kapazität nicht, kommen **ältere Anfragen zuerst** (Sortierung nach `createdAt`).

Ablauf in drei Phasen:

1. **Greedy „Cheapest Insertion“** – Anfragen nach Alter sortieren, für jede alle zuständigen Techniker-Tage und Einfügepositionen simulieren, die regelkonforme Position mit dem geringsten Fahrzeit-Zuwachs nehmen.
2. **Lokale Verbesserung** – 2-opt je Route (Abschnitt umdrehen) und Relocate (Anfrage in andere Route / anderen Tag), solange die Gesamtfahrzeit sinkt. Jeder Schritt wird voll simuliert → Regeln bleiben erfüllt.
3. **Warteliste erneut** in Altersreihenfolge einplanen (durch Phase 2 frei gewordene Kapazität).

Die Mittagspause wird in jede passende Lücke gelegt (vor der Weiterfahrt, in Wartezeit, vor Abfahrt oder nach Heimkehr). Freigegebene Routen und bestätigte Notiz-Zeitgrenzen gehen als harte Vorgaben in die Planung.

### Fahrzeiten

`api/src/travelMatrix.ts` baut eine Fahrzeitmatrix aus `/travel/path`:

- Nur Paare, die in einer Route benachbart sein können (gleicher zuständiger Techniker: Wohnort, Anfragen, fixe Termine).
- Paare werden zu Pfaden mit bis zu 14 Punkten verkettet → **13 Fahrten pro Call** statt einer.
- 4 Calls parallel, Ergebnis auf Platte gecacht (`api/data/travel-cache.json`), Fallback pro Paar auf Luftlinien-Schätzung (in der UI mit „≈“ markiert, in der Prüfung ausgewiesen).
- Vorab laden: `npm run travel:prewarm -w api` (sonst beim ersten Aufruf des Plans).

### Plan-Prüfung

`verifyPlan()` rechnet den fertigen Plan **ohne Code aus dem Planer** nach – nur aus den ausgegebenen Uhrzeiten, den Originaldaten und derselben Fahrzeitquelle. 10 Regeln: Fenster, Anfahrt/Überlappung, Heimfahrt, Mittagspause (inkl. „hätte gepasst“), Kundenzeiten, Dauer, fixe Termine, Zuständigkeit, keine Anfrage doppelt/verloren, Priorität.

### Tests

`npm test -w api` – 11 Tests (Node Test Runner): gesamter Datensatz 0 Verstöße, Optimierung nie schlechter als Greedy, harte Kundenzeit, Pause nur an ganzen Tagen, 15-km-Regel, ältere Anfrage gewinnt, fixe Termine, unbekannter Typ = 105 min, Freigabe bleibt bei Neuplanung, bestätigte Notiz, und: **der Validator erkennt eingeschleuste Fehler** (Überlappung, Duplikat, verlorene Anfrage, falsche Pause). Läuft in GitHub Actions (`.github/workflows/ci.yml`).

---

## Umgang mit unsauberen Daten

Umgesetzt in `api/src/validation.ts`. Befunde haben drei Stufen: **Fehler** (blockiert Planung), **Warnung** (wird mit Annahme geplant), **Hinweis**.

| Problem | Behandlung |
|---|---|
| Anfrage ohne Koordinaten | Fehler · nicht planbar, bis geokodiert (`/travel` akzeptiert Adressen) |
| Adresse ohne PLZ / Tippfehler | Warnung · zur Prüfung markiert |
| Besichtigungstyp `null` | Warnung · 105 min angenommen |
| Dauer passt nicht zum Typ | Warnung |
| Ungültige Uhrzeit bei `customerAvailableFrom` | Fehler |
| Außerhalb aller Gebiete und > 15 km | Fehler · *nicht zuordenbar*, Warteliste |
| Techniker ohne Gebiet | Warnung · nur 15-km-Regel |
| Techniker ohne Verfügbarkeit | Fehler · wird nicht eingeplant |
| Fixer Termin an gesperrtem Tag / Überschneidung | Fehler · muss umgeplant werden |
| Freitext-Notizen | Hinweis · zur Durchsicht |

---

## Lokale Korrekturen (simulierte Schreib-API)

Die Case-Study-API ist **read-only** – trotzdem lassen sich Datenprobleme direkt in der App beheben:

1. In der Detailansicht (z. B. `/stammdaten/anfragen/req_1008`) Feld korrigieren → **Speichern**.
2. Das Frontend sendet einen echten `PATCH /api/stammdaten/:bereich/:id` an die eigene API.
3. Die API prüft die Eingabe (Zahlen, Bereich Österreich, `HH:MM`, gültiger Typ …) und speichert sie als **Override** in `api/data/local-db.json`.
4. Bei jedem Abruf werden die Heizma-Daten + Overrides zusammengeführt → **Validierung und Routenplanung werden sofort neu berechnet**. Die Originaldaten bleiben unverändert; „Original wiederherstellen“ entfernt den Override.

In Produktion würde derselbe Endpunkt ins CRM zurückschreiben – Frontend und Planung bleiben gleich.

### Regionen, Auslastung & Eskalation

- **Regionsfilter** (Stammdaten-Listen und Planer, `?region=tech_01` in der URL): ein Techniker = ein Einsatzgebiet. „Ohne Zuständigkeit“ zeigt Anfragen außerhalb aller Gebiete (> 15 km vom Wohnort).
- **Auslastung**: Balken je Techniker und Tag (vor Ort · Fahrt · Pause/Warten · frei) und eine Wochenübersicht je Region auf der Startseite. Heimfahrt bis +60 min wird als „erlaubt“ angezeigt, darüber als Regelverstoß.
- **Nicht eingeplant** – je Grund genau eine Aktion:
  - *Kapazität erschöpft* → **Kunde informieren**: Nachrichtenentwurf mit neuem Terminvorschlag (erster Werktag nach der Planungswoche, änderbar)
  - *Keine Koordinaten* → **Korrigieren** (Detailansicht)
  - *Nicht zuordenbar / Techniker ohne Verfügbarkeit* → **Intern eskalieren**
  
  Eskalationen sind simuliert: `POST /api/escalations/:requestId` speichert die Nachricht in `local-db.json` (`escalations`), es wird nichts versendet. `DELETE` nimmt sie zurück.

**Bearbeitbare Felder**

| Bereich | Felder |
|---|---|
| Anfragen | `address`, `lat`, `lng`, `visitationType`, `durationMinutes`, `customerAvailableFrom`, `notes` |
| Techniker | `name`, `region` (eine Zeile pro Eckpunkt `lat, lng`) |
| Fixe Termine | – (laut Case nicht verschiebbar; Konflikte werden nur gemeldet) |

**Endpunkte**

| Methode | Pfad | Beschreibung |
|---|---|---|
| PATCH | `/api/stammdaten/:entity/:id` | Korrektur speichern (`entity` = `requests` · `technicians` · `appointments`) |
| DELETE | `/api/stammdaten/:entity/:id` | Korrektur entfernen (Original wiederherstellen) |
| GET | `/api/local-db` | Aktuellen DB-Dump + bearbeitbare Felder anzeigen |
| POST | `/api/local-db/reset?scope=planning` | Nur für Tests: Freigaben, Entscheidungen, bestätigte Notizen und Eskalationen löschen – Korrekturen bleiben |
| POST | `/api/local-db/reset` | Alles löschen, inkl. aller Korrekturen |

**Beispiel-Dump: fehlende Koordinaten nachtragen**

`api/data/local-db.example.json` trägt für die 8 Anfragen ohne Koordinaten Werte nach (Ortsmitte der PLZ, genügt für die Planung):

```json
{
  "version": 1,
  "overrides": {
    "requests": {
      "req_1008": { "lat": 48.3858, "lng": 16.2111 },
      "req_1027": { "lat": 47.567, "lng": 14.2398 },
      "req_1046": { "lat": 48.6626, "lng": 15.6566 },
      "req_1065": { "lat": 47.1107, "lng": 14.1717 },
      "req_1084": { "lat": 48.3453, "lng": 16.3331 },
      "req_1103": { "lat": 47.7376, "lng": 16.3963 },
      "req_1122": { "lat": 47.2692, "lng": 11.4041 },
      "req_1141": { "lat": 46.815, "lng": 15.2153 }
    },
    "technicians": {},
    "appointments": {}
  }
}
```

Aktivieren und API neu starten:

```bash
cp api/data/local-db.example.json api/data/local-db.json
```

Ergebnis: Die Anfragen werden nicht mehr als „Keine Koordinaten“ blockiert, sondern normal geprüft – liegen sie in einem Einsatzgebiet, landen sie in den Routen (oder auf der Warteliste, wenn die Kapazität nicht reicht). `req_1122` (Innsbruck) bleibt bewusst **nicht zuordenbar** – Tirol liegt in keinem Einsatzgebiet und > 15 km von jedem Wohnort. So zeigt der Dump beide Fälle: Datenfehler beheben ✓, echte Geschäftsregel bleibt bestehen ✓.

Hinweise:
- `api/data/local-db.json` ist in `.gitignore` – jede Umgebung hat ihre eigenen Korrekturen.
- Speicherort per `LOCAL_DB_PATH` änderbar. Auf **Vercel** liegt die Datei unter `/tmp` und ist **nicht dauerhaft** (wird bei neuen Instanzen zurückgesetzt) – für die Demo ausreichend, in Produktion käme eine Datenbank bzw. das CRM.

---

## API-Endpunkte

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/health` | Status & Datenquelle |
| GET | `/api/meta` | Zeitraum, Datenquelle, Firmensitz |
| GET | `/api/stammdaten` | Techniker, Verfügbarkeiten, Anfragen, Termine + Validierungsbefunde |
| GET | `/api/overview` | Kennzahlen für die KPI-Kacheln |
| GET | `/api/plan` | Routenplan inkl. Warteliste, Kennzahlen, Fahrzeitquelle und Plan-Prüfung |
| POST | `/api/approvals` | Routen freigeben (`{ keys: ["tech_01@2026-11-23"] }`, ohne keys alle; `?date=` für einen Tag) |
| DELETE | `/api/approvals` | Freigaben zurücknehmen |
| GET | `/api/plan/:technicianId/:date/ics` | Tagesroute als Kalenderdatei |
| GET | `/api/notes` | KI-Hinweise aus den Notizen + bestätigte Zeitgrenzen |
| POST | `/api/notes/:requestId/confirm` | Zeit-Hinweis als harte Regel übernehmen (`{ earliest?, latest? }`, leer = zurücknehmen) |
| GET | `/api/plan/:technicianId/:date/geometry` | Straßenverlauf einer Tagesroute (über `/travel/path`, gecacht) |
| POST | `/api/reload` | Cache leeren, Daten neu laden |

---

## Projektstruktur

```
.
├── api/                      # Node/Express-Service (TypeScript)
│   ├── src/
│   │   ├── index.ts          # Routen
│   │   ├── config.ts         # .env-Konfiguration
│   │   ├── heizmaClient.ts   # Client für die Case-Study-API (Cache, Mock)
│   │   ├── validation.ts     # Datenprüfung + Zuständigkeitsregel
│   │   ├── planner.ts        # Planungs-Algorithmus (Greedy + 2-opt/Relocate)
│   │   ├── verify.ts         # unabhängige Plan-Prüfung
│   │   ├── travelMatrix.ts   # Fahrzeitmatrix aus /travel/path (Cache)
│   │   ├── notesAi.ts        # Notizen → Hinweise (Claude, Fallback Regeln)
│   │   ├── __tests__/        # Tests
│   │   ├── geo.ts / time.ts  # Haversine, Punkt-in-Polygon, Zeit-Helfer
│   │   ├── types.ts          # gemeinsame Typen (auch vom Web genutzt)
│   │   └── fixtures/         # Mock-Daten für den Offline-Modus
│   └── Dockerfile
├── web/                      # React/Vite-Frontend
│   ├── src/
│   │   ├── assets/brand/     # Logo
│   │   ├── components/       # Header, UI-Bausteine, Planer-Komponenten
│   │   ├── pages/            # Stammdaten, Liste, Detail, Planer
│   │   └── lib/              # API-Hooks, Formatierung, Bereichs-Definitionen
│   ├── nginx.conf
│   └── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Trade-offs & bekannte Vereinfachungen

- **Fahrzeit symmetrisch angenommen** (A→B ≈ B→A) – halbiert die Calls an `/travel/path`; Abweichung in der Praxis gering. Keine Tageszeit-abhängigen Fahrzeiten (Stau).
- **Heuristik statt Solver:** Greedy + 2-opt/Relocate ist schnell (< 1 s), nachvollziehbar und regelkonform, aber nicht beweisbar optimal. Ein Solver (z. B. OR-Tools VRPTW) wäre der nächste Schritt für große Mengen.
- **Priorität „ältere zuerst“** wird über die Einplanungsreihenfolge umgesetzt: Eine jüngere Anfrage bekommt nur einen Platz, in den die ältere nicht passte (Ort/Zeitfenster). Die Prüfung weist solche Fälle als Hinweis aus.
- **KI nur als Vorschlag:** Notiz-Hinweise werden nie automatisch zur Regel – erst nach Klick des Planers.
- **Speicherung** von Korrekturen, Freigaben und Bestätigungen lokal als JSON statt Datenbank.
- **Benachrichtigungen** (Kunden und Außendienstler bei Freigabe, Eskalationen) sind angenommen bzw. simuliert – es wird nichts versendet.
- **Kein Rückgängig nach der Veröffentlichung:** Veröffentlichte Freigaben lassen sich nicht per Button rückgängig machen (dafür wären Absagen an Kunden und Außendienst nötig). Zum Testen gibt es stattdessen den Reset des Planungsstands.

## Nächste Schritte

1. Adress-Tippfehler per LLM + Geokodierung korrigieren (mit Freigabe), statt nur zu markieren.
2. Gleichmäßigere Auslastung über die Woche (Balancing als zweites Ziel neben Fahrzeit).
3. Drag & Drop auf Karte/Zeitleiste als zweiter Weg zu „Verschieben“ (gleiche Endpunkte); Rollen/Benutzer im Änderungsprotokoll.
4. Tageszeit-abhängige Fahrzeiten (Berufsverkehr) und Puffer pro Stopp.
5. Schreibende Anbindung an CRM/Kalender statt lokaler JSON-Datei.
