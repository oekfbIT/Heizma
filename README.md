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

**Karte:** Mit `VITE_GOOGLE_MAPS_API_KEY` (Maps JavaScript API, [Key erstellen](https://console.cloud.google.com/google/maps-apis/credentials)) wird Google Maps verwendet, ohne Key automatisch Leaflet mit freien Kacheln.

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
- **Detail-/Bearbeitungsansicht:** fehlerhafte Felder sind rot bzw. gelb markiert, inkl. Begründung. Speichern ist bewusst deaktiviert – die Case-Study-API ist read-only.

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

## Nächste Schritte

1. Fahrzeitmatrix über `/travel` aufbauen (persistenter Cache) und den Planer damit rechnen lassen.
2. Fehlende Koordinaten automatisch geokodieren; Adress-Tippfehler per LLM korrigieren (mit Freigabe).
3. Notizen per LLM in strukturierte Hinweise übersetzen (z. B. „nur vormittags“).
4. Lokale Verbesserung (2-opt, Verschieben/Tauschen zwischen Tagen) und gleichmäßigere Auslastung.
5. Validator als automatisierter Test über den fertigen Plan („0 Regelverstöße“).
6. Freigaben persistieren; manuelles Umplanen per Drag & Drop.
