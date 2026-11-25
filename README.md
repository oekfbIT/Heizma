# Heizma · Einsatz- & Routenplanung (Case Study)

Prototyp für die **Routenoptimierung-Case-Study** von Heizma: offene Besichtigungs-Anfragen werden automatisch auf Außendienst-Techniker:innen und Tage verteilt, pro Person entsteht eine fahrzeitoptimierte Tagesroute. Der Planer soll nur noch **draufschauen und freigeben**, statt selbst zu rechnen.

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
- **Listen** mit Suche, Filter „Nur Probleme“ und Status-Spalte (OK / Warnung / Fehler).
- **Detail-/Bearbeitungsansicht:** fehlerhafte Felder sind rot bzw. gelb markiert, inkl. Begründung. Korrekturen werden per `PATCH` gespeichert und fließen sofort in Prüfung & Tourenplan ein (siehe „Lokale Korrekturen“).

### 2. Routenplanung (`/planer`, grüner Button oben rechts)

- Layout angelehnt an Google Maps: **Sidebar links, Karte rechts.**
- **Tages-Tabs** mit Anzahl der Stopps pro Tag.
- **Techniker-Zellen:** Anzahl Stopps, neue vs. fixe Termine, Fahrzeit, Arbeitsfenster; gesperrte Personen bzw. Personen ohne Verfügbarkeit ausgegraut.
- **Klick auf eine Person:** Route auf der Karte (Start & Ende am Wohnort), nummerierte Stopps, Tagesablauf mit Abfahrt, Ankunftszeiten, Wartezeiten, Mittagspause und Heimfahrt.
- **Hover** über Stopp (Karte oder Liste): Ankunftszeit, Terminfenster, Adresse.
- **Checkboxen** je Stopp und **„Route freigeben“** (aktuell lokal im Browser).
- **Warteliste** mit allen nicht eingeplanten Anfragen, gruppiert nach Grund.
- Heizma-Firmensitz als Referenzpunkt auf der Karte.

---

## Planungsregeln

Umgesetzt in `api/src/planner.ts` (Greedy „Cheapest Insertion“):

1. Arbeitstag liegt im Verfügbarkeitsfenster und beginnt/endet am **Wohnort**.
2. Jeder Termin **inkl. Anfahrt** liegt im Fenster; nur die Heimfahrt darf bis **60 min** darüber hinaus.
3. **Mittagspause** 60 min, Beginn 11:30–13:00, nur an ganzen Tagen; passt sie nicht, entfällt sie.
4. `customerAvailableFrom` ist eine **harte Grenze** (früher ankommen → Wartezeit).
5. **Zuständigkeit:** Anfrage im Einsatzgebiet (Punkt-in-Polygon) → sonst Wohnort ≤ 15 km → sonst *nicht zuordenbar*.
6. **Fixe Termine** bleiben, wo sie sind, und sind Stopps der Route.
7. **Keine Überschneidungen**, auch nicht der Fahrzeiten.
8. Reicht die Kapazität nicht, kommen **ältere Anfragen zuerst** (Sortierung nach `createdAt`).

Ablauf: Anfragen nach Alter sortieren → für jede Anfrage alle zuständigen Techniker-Tage und alle Einfügepositionen prüfen → die Position mit dem geringsten Fahrzeit-Zuwachs nehmen, die alle Regeln erfüllt → sonst Warteliste.

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
4. Bei jedem Abruf werden die Heizma-Daten + Overrides zusammengeführt → **Validierung und Tourenplan werden sofort neu berechnet**. Die Originaldaten bleiben unverändert; „Original wiederherstellen“ entfernt den Override.

In Produktion würde derselbe Endpunkt ins CRM zurückschreiben – Frontend und Planung bleiben gleich.

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
| POST | `/api/local-db/reset` | Alle Korrekturen löschen |

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

Ergebnis: Die Anfragen werden nicht mehr als „Keine Koordinaten“ blockiert, sondern normal geprüft – liegen sie in einem Einsatzgebiet, landen sie in den Touren (oder auf der Warteliste, wenn die Kapazität nicht reicht). `req_1122` (Innsbruck) bleibt bewusst **nicht zuordenbar** – Tirol liegt in keinem Einsatzgebiet und > 15 km von jedem Wohnort. So zeigt der Dump beide Fälle: Datenfehler beheben ✓, echte Geschäftsregel bleibt bestehen ✓.

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
| GET | `/api/plan` | Tourenplan (Entwurf) inkl. Warteliste |
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
│   │   ├── planner.ts        # Planungs-Algorithmus
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

- **Fahrzeiten in der Planung geschätzt** (Luftlinie × 1,3, Ø 65 km/h + 5 min). Grund: Bei ~150 Anfragen bräuchte eine vollständige Matrix sehr viele Calls. Für die Kartenanzeige wird der echte Straßenverlauf über `/travel/path` geladen.
- **Greedy statt Solver:** schnell, nachvollziehbar und regelkonform, aber nicht global optimal. Verplant tendenziell die frühen Tage zuerst (passt zur Regel „ältere Anfragen zuerst“).
- **Mittagspause** wird vor der Weiterfahrt eingeplant, wenn sie ins Fenster fällt – nicht über alle möglichen Positionen optimiert.
- **Freigaben & Checkboxen** sind aktuell nur im Browser-State.
- **Korrekturen** werden lokal als JSON gespeichert statt in einer Datenbank (siehe „Lokale Korrekturen“).

## Nächste Schritte

1. Fahrzeitmatrix über `/travel` aufbauen (persistenter Cache) und den Planer damit rechnen lassen.
2. Fehlende Koordinaten automatisch geokodieren; Adress-Tippfehler per LLM korrigieren (mit Freigabe).
3. Notizen per LLM in strukturierte Hinweise übersetzen (z. B. „nur vormittags“).
4. Lokale Verbesserung (2-opt, Verschieben/Tauschen zwischen Tagen) und gleichmäßigere Auslastung.
5. Validator als automatisierter Test über den fertigen Plan („0 Regelverstöße“).
6. Freigaben persistieren; manuelles Umplanen per Drag & Drop.
