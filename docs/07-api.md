[← 6 Tests & Qualität](06-tests-und-qualitaet.md) · **7 API-Referenz** · [8 Trade-offs & Ausblick →](08-trade-offs-und-ausblick.md)

# API-Referenz

Die eigene API unter `/api`. Alle Routen außer `/api/health` und `/api/auth/*` verlangen `Authorization: Bearer <sitzungstoken>` (Mock-Login, siehe [Setup](09-setup.md#anmeldung)). Fehler kommen einheitlich als `{ "error": "…" }`.

Im Frontend ist der zuständige **Interactor** angegeben – Views rufen keine Endpunkte direkt auf.

## Daten & Konfiguration

| Methode | Pfad | Beschreibung | Interactor |
|---|---|---|---|
| GET | `/api/health` | Status & Datenquelle | – |
| GET | `/api/config` | Karten-Konfiguration (Google-Key oder Kachel-URL) | `system.config` |
| GET | `/api/meta` | Zeitraum, Datenquelle, Firmensitz, nächster Werktag | `system.meta` |
| GET | `/api/stammdaten` | Außendienst, Verfügbarkeiten, Anfragen, Termine + Prüfbefunde, Zuständigkeiten, Eskalationen | `techniker` · `termine` · `anfragen` · `system.stammdaten` |
| GET | `/api/overview` | Kennzahlen der Startseite | `system.overview` |
| POST | `/api/reload` | „Neu planen“: Heizma-Daten frisch laden, neu optimieren; `?reset=1` verwirft vorher Eingriffe und Freigaben | `core.replan()` |

## Plan & Freigabe

| Methode | Pfad | Beschreibung | Interactor |
|---|---|---|---|
| GET | `/api/plan` | Routen, Warteliste, Kennzahlen inkl. Vergleich Handplanung (`stats.baseline`), Fahrzeitquelle, Plan-Prüfung | `routen.plan` |
| GET | `/api/plan/:technicianId/:date/geometry` | Straßenverlauf einer Tagesroute (gecacht) | `routen.geometry()` |
| POST | `/api/approvals` | Freigeben: `{ keys: ["tech_01@2026-11-23"] }` oder `?date=` für einen Tag | `core.approveRoute()` · `core.approveDay()` |
| DELETE | `/api/approvals` | Freigabe zurücknehmen | `core.approveRoute()` |

## Eingriffe des Planers

| Methode | Pfad | Beschreibung | Interactor |
|---|---|---|---|
| GET | `/api/requests/:id/planning` | Status, Route, Warteliste, Entscheidung, Verstöße/Ausnahmen, Änderungen | `anfragen.planning.get(id)` |
| GET | `/api/requests/:id/options` | Mögliche Personen-Tage, sortiert (Vorschau, ändert nichts) | `anfragen.options()` |
| POST | `/api/requests/:id/decision` | `{ mode: pin \| exclude, technicianId?, date?, reason, override? }` – Antwort enthält den neuen Planungsstand | `core.decideRequest()` |
| DELETE | `/api/requests/:id/decision` | Entscheidung zurücknehmen → wieder automatisch geplant | `core.decideRequest(id, null)` |

## Datenkorrekturen & Eskalation

| Methode | Pfad | Beschreibung | Interactor |
|---|---|---|---|
| PATCH | `/api/stammdaten/:entity/:id` | Korrektur speichern (`requests` · `technicians` · `appointments`) | `core.updateEntity()` |
| DELETE | `/api/stammdaten/:entity/:id` | Original wiederherstellen | `core.resetEntity()` |
| GET | `/api/geocode?address=` | Adresse → Koordinaten (Google, sonst OSM) | `anfragen.geocode()` |
| GET | `/api/geocode/reverse?lat=&lng=` | Koordinaten → Adresse | `anfragen.reverseGeocode()` |
| POST · DELETE | `/api/escalations/:requestId` | Kunde informieren / intern eskalieren (simuliert) | `core.escalateRequest()` · `core.withdrawRequestEscalation()` |
| POST · DELETE | `/api/escalations/technicians/:id/:target` | Außendienst anfragen / Vertrieb informieren (`target` = `techniker` · `vertrieb`) | `core.escalateTechnician()` · `core.withdrawTechnicianEscalation()` |
| GET | `/api/local-db` | Gespeicherte Korrekturen + bearbeitbare Felder | `system.localDb` |
| POST | `/api/local-db/reset?scope=planning` | Nur für Tests: Freigaben, Entscheidungen, Eskalationen löschen – Korrekturen bleiben | `core.resetPlanning()` |
| POST | `/api/local-db/reset` | Alles löschen, inkl. Korrekturen | – |

## Anmeldung

| Methode | Pfad | Beschreibung |
|---|---|---|
| POST | `/api/auth/login` | `{ email, password }` → `{ token, user }` (HMAC-signiert, zustandslos) |
| POST | `/api/auth/logout` | Sitzung beenden |

---

[← 6 Tests & Qualität](06-tests-und-qualitaet.md) · [8 Trade-offs & Ausblick →](08-trade-offs-und-ausblick.md)
