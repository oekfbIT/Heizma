[← 8 Trade-offs & Ausblick](08-trade-offs-und-ausblick.md) · **9 Setup** · [10 Code-Navigation →](10-code-navigation.md)

# Setup

## Voraussetzungen

- **Docker** (empfohlen) **oder** Node.js **≥ 22.9**
- Token für die Case-Study-API (kommt mit der Einladung) – ohne Token läuft alles mit `DATA_SOURCE=mock`

## 1. Konfiguration

```bash
cp .env.example .env
# HEIZMA_API_TOKEN eintragen
```

Secrets stehen nur in `.env` (nicht im Repository).

## 2a. Start mit Docker

```bash
docker compose up --build
```

- Web-App: http://localhost:8080
- API: http://localhost:4000/api/health

## 2b. Lokale Entwicklung

```bash
npm install
npm run dev
```

- Web (Vite, Hot Reload): http://localhost:5173 – `/api` wird an die API weitergeleitet
- API (tsx watch): http://localhost:4000

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | API + Web gleichzeitig |
| `npm run build` | Produktions-Build beider Pakete |
| `npm run check` | Typecheck + Architektur-Wächter + alle Tests |
| `npm test` | Tests API (Node Test Runner) + Web (Vitest) |
| `npm run test:coverage` | Tests mit Coverage-Report |
| `npm run check:architecture` | Nur die Schichtregeln prüfen |
| `npm run travel:prewarm -w api` | Fahrzeitmatrix vorab laden (sonst beim ersten Plan-Aufruf) |

## Anmeldung

Mock-Login ohne externe Dienste (`api/src/mockauth/`):

- **E-Mail:** `planner@heizma.at` · **Passwort:** `1nvite0nly`
- Token nur im `sessionStorage` → gilt pro Browser-Tab, Standard 2 h
- Zustandslos, HMAC-signiert (funktioniert auch serverless)

## Umgebungsvariablen

| Variable | Zweck | Standard |
|---|---|---|
| `DATA_SOURCE` | `live` (Heizma-API) oder `mock` (Beispieldaten aus `api/src/fixtures`) | `live` |
| `HEIZMA_API_BASE_URL`, `HEIZMA_API_TOKEN` | Zugang zur Case-Study-API | – |
| `PLAN_FROM`, `PLAN_TO` | Planungszeitraum (max. 31 Tage) | 2026-11-23 – 2026-11-27 |
| `CACHE_TTL_SECONDS` | Cache für API-Antworten | 600 |
| `API_PORT`, `WEB_PORT` | Ports | 4000 / 8080 |
| `GOOGLE_MAPS_API_KEY`, `GOOGLE_MAPS_MAP_ID` | Google Maps; leer → Leaflet mit freien Kacheln | leer |
| `MAP_TILE_URL`, `MAP_ATTRIBUTION` | Kacheln für Leaflet | Esri |
| `OFFICE_LAT`, `OFFICE_LNG` | Firmensitz als Referenzpunkt | Wien |
| `MOCK_AUTH_EMAIL`, `MOCK_AUTH_PASSWORD`, `MOCK_AUTH_TTL_HOURS`, `MOCK_AUTH_SECRET` | Mock-Login | siehe oben |
| `LOCAL_DB_PATH`, `TRAVEL_CACHE_PATH`, `NOTES_CACHE_PATH` | Speicherorte | `api/data/…` |

## Zum Testen

- **Planungsstand zurücksetzen:** In der Routenplanung „Test: Planungsstand zurücksetzen“ – löscht Freigaben, Entscheidungen und Eskalationen. Korrekturen bleiben.
- **Beispiel-Korrekturen laden:** `cp api/data/local-db.example.json api/data/local-db.json` ([Details](04-datenqualitaet.md#korrigieren-obwohl-die-api-read-only-ist))
- **Styleguide:** http://localhost:5173/styleguide

## Deployment

- **Docker Compose:** `api` (Node) + `web` (nginx, statischer Build).
- **Vercel:** `vercel.json` definiert beide Services; `/api/*` geht an Express. Lokale Daten liegen dort unter `/tmp` und sind nicht dauerhaft.

---

[← 8 Trade-offs & Ausblick](08-trade-offs-und-ausblick.md) · [10 Code-Navigation →](10-code-navigation.md)
