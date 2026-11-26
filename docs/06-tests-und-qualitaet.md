[← 5 Design-System](05-design-system.md) · **6 Tests & Qualität** · [7 API-Referenz →](07-api.md)

# Tests & Qualität

```bash
npm run check           # Typecheck + Architektur-Wächter + Code-Navigation + alle Tests
npm run test:coverage   # Tests mit Coverage (API + Web)
```

Alles läuft auch in GitHub Actions (`.github/workflows/ci.yml`) bei jedem Push.

## Überblick

| Ebene | Werkzeug | Umfang |
|---|---|---|
| **Planung & Prüfung** (API) | Node Test Runner | 26 Tests |
| **Core, Module, Tokens** (Web) | Vitest | 58 Tests |
| **Architektur-Regeln** | `scripts/check-architecture.mjs` | 6 Regeln |
| **Typen** | `tsc --noEmit` | API + Web, `strict` |
| **Visueller Vergleich** | Playwright | Alter vs. neuer Build, 8 Ansichten ([Ergebnis](05-design-system.md#ohne-sichtbare-änderung-umgestellt)) |

## API: die Planung

`api/src/__tests__/planner.test.ts` – fachliche Tests in der Sprache der Case Study. Jeder Test trägt den Tag der Regel, die er absichert (`// REGEL-2`); die CI prüft, dass jede Regel mindestens einen Test hat ([Code-Navigation](10-code-navigation.md)).

- Gesamter Datensatz: **0 Regelverstöße**
- Optimierung ist **nie schlechter als Greedy** und plant nicht weniger ein
- `customerAvailableFrom` ist eine harte Grenze
- Termin muss im Fenster enden, nur die **Heimfahrt darf bis 60 min drüber**; > 60 min → „Passt in keinen Tag“
- Mittagspause nur an ganzen Tagen, 60 min, Beginn 11:30–13:00 · wird **nie für einen weiteren Besuch geopfert**
- Zuständigkeit: außerhalb des Gebiets ≤ 15 km wird eingeplant, > 15 km nicht zuordenbar
- Kapazität knapp: **ältere Anfrage gewinnt** · Tausch-Durchgang: wartende ältere ersetzt eine jüngere
- Fixe Termine bleiben, wo sie sind · unbekannter Typ = 105 min
- Freigegebene Route bleibt bei Neuplanung unverändert
- **Der Validator erkennt eingeschleuste Fehler** (Überlappung, Duplikat, verlorene Anfrage, falsche Pause)
- Bestätigte Notiz „nur vormittags“ wird harte Grenze · offener Zeitwunsch wird nie automatisch geplant
- Uhrzeit-Formatfehler („10.00“) wird gelesen, geplant und als Warnung gemeldet
- Fixieren, Herausnehmen, Vorziehen, Tausch, Regelbruch mit/ohne Ausnahme
- Optionen: regelkonforme Slots zuerst, freigegebene Routen am Ende
- Datenfehler sperren die Planung – nach Korrektur wird geplant
- Prognose: Warteliste wird über Folgewochen abgearbeitet

## Web: die Schichten

`web/src/__tests__/` – laufen ohne Browser. Der `ApiService` bekommt ein Fake-`fetch` injiziert, damit jede Schicht isoliert testbar ist.

| Datei | Prüft u. a. |
|---|---|
| `ApiService.test.ts` | Bearer-Header, Cache, **parallele GETs = 1 Request**, Cache leer nach Schreiben, verspätete Antworten landen nicht im geleerten Cache, 401 → Abmelden, Server-Fehlermeldung, Download |
| `Resource.test.ts` | Laden, Fehler behalten alte Daten, **nur die jüngste Anfrage gewinnt**, aktiv nur mit Abonnenten |
| `TechnikerInteractor.test.ts` | `getName`, `getShortName`, `getLabel`, `getAvailability`, Tage sortiert, stabile Farben, schreibt nur eigene Endpunkte |
| `AnfragenInteractor.test.ts` | Regionsfilter inkl. „ohne Zuständigkeit“, Ort/Alter, KI-Hinweise, Entscheidungen POST/DELETE |
| `RoutenInteractor.test.ts` | Verstöße je Stopp/Route, Tagesstatus, Plan-Status je Anfrage, Ausnahmen, Warteliste |
| `CoreInteractor.test.ts` | Nach Änderung werden **nur angezeigte** Daten neu geladen, Freigabe/Rücknahme, Korrekturen gehen an das richtige Modul |
| `ui.test.ts` | Token → Hex, Routenfarben, `cx`, Formatierung, System- und Termine-Modul |

## Coverage

Stand dieser Version (`npm run test:coverage`):

**Web – Core, Module, Design-Tokens**

| Bereich | Zeilen | Zweige |
|---|---|---|
| `core/` (ApiService, Resource, CoreInteractor) | 87 % | 96 % |
| `modules/` (alle fünf Interactors) | 92–100 % | 83–100 % |
| `ui/theme.ts`, `ui/cx.ts` | 96 % | 83 % |
| **Gesamt** | **91 %** | **93 %** |

**API**

| Datei | Zeilen | Zweige |
|---|---|---|
| `verify.ts` (Prüfung) | **100 %** | 92 % |
| `planner.ts` (Algorithmus) | **96 %** | 84 % |
| `validation.ts` | 83 % | 76 % |
| `geo.ts`, `time.ts` | 100 % | 83–100 % |
| `heizmaClient.ts`, `travelMatrix.ts` (Netzwerk) | 15–25 % | – |

**Ehrlich eingeordnet:** Die fachliche Logik – Planen, Prüfen, Aufbereiten – ist gut abgedeckt. Nicht abgedeckt sind:

- **Netzwerk-Code** der API (`heizmaClient`, `travelMatrix`): bräuchte einen Mock-Server.
- **Express-Routen** (`index.ts`) und **`localStore.ts`**: tauchen im Report gar nicht auf, weil kein Test sie lädt.
- **React-Views und `useResource`**: keine Komponenten-Tests. Abgesichert durch Typecheck, den visuellen Vergleich und manuell geprüfte Abläufe (Route freigeben/zurücknehmen, Korrektur speichern/wiederherstellen, Fixieren/Lösen, Verschieben-Optionen).

Nächster Schritt wären Playwright-End-to-End-Tests für die Hauptabläufe in CI ([Ausblick](08-trade-offs-und-ausblick.md)).

## Architektur-Wächter

```
$ npm run check:architecture
✓ Nur der ApiService ruft fetch auf (Ausnahme: Login vor der Sitzung)
✓ Views greifen nie direkt auf den ApiService zu – nur über den CoreInteractor
✓ Keine alten Datenzugriffe (useApi, apiGet, apiSend, lib/api)
✓ Keine fest codierten Hex-Farben außerhalb des Design-Systems
✓ Nur Token-Farben: danger/warning/info/accent statt red/amber/sky/violet
✓ Keine Alt-Klassen (btn-primary, btn-secondary) und keine selbstgebauten Dialog-Overlays

Architektur sauber.
```

Architektur, die nur in einem Diagramm steht, verwässert mit der Zeit. Dieses Skript macht sie zu einer Bedingung für jeden Merge – ohne zusätzliche Abhängigkeit.

---

[← 5 Design-System](05-design-system.md) · [7 API-Referenz →](07-api.md)
