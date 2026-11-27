<div align="center">

# Heizma · Einsatz- & Routenplanung

**Offene Besichtigungs-Anfragen automatisch auf Außendienst und Tage verteilen – mit fahrzeitoptimierter Tagesroute pro Person.**
Der Planer schaut drauf und gibt frei, statt selbst zu rechnen.

`TypeScript` · `React 18` · `Node/Express` · `Tailwind` · `Google Maps` · `Vitest` · `Docker`

![Routenplanung: Tagesroute einer Person mit Zeitplan und Karte](docs/assets/planer-route.png)

</div>

---

## Die Case-Anforderungen – und wo sie gelöst sind

| Anforderung aus der Case Study | Lösung | Mehr |
|---|---|---|
| Anfragen **automatisch** auf Außendienstler und Tage verteilen | Planer in 3 Phasen: Greedy *Cheapest Insertion* → 2-opt + Relocate → Warteliste erneut | [Planung & Regeln](docs/03-planung-und-regeln.md) |
| **Fahrzeitoptimierte** Tagesroute pro Person | Echte Fahrzeitmatrix aus `/travel/path` (13 Fahrten pro Call). Der Planer zeigt die Ersparnis **gegenüber einer Handplanung** auf denselben Daten (Fahrzeit, Besuche, Ø Anfahrt). Jede Änderung (neue Daten, Korrektur, Eingriff, Freigabe) löst automatisch eine Neuplanung aus | [Fahrzeiten](docs/03-planung-und-regeln.md#fahrzeiten) |
| Planer soll **nur draufschauen und freigeben** | 3-Schritt-UI: Tag wählen → Route prüfen → freigeben. Freigegebene Routen bleiben bei jeder Neuplanung fix | [Ergebnis](docs/01-aufgabe-und-ergebnis.md) |
| **Alle 8 Regeln** eingehalten | Jede Regel im Planer umgesetzt **und** unabhängig nachgeprüft: Badge „✓ 0 Regelverstöße · 11 Regeln“ – die elfte Prüfung rechnet nach, dass sich alle angezeigten Zahlen addieren | [Regeln & Nachweis](docs/03-planung-und-regeln.md#die-regeln--umsetzung-und-nachweis) |
| **Unsaubere Daten** (fehlende Koordinaten, Tippfehler, ohne Gebiet, ohne Verfügbarkeit …) | Validierung mit Fehler / Warnung / Hinweis, Korrektur direkt in der App, Geocoding, Eskalation | [Datenqualität](docs/04-datenqualitaet.md) |
| **Ältere Anfragen zuerst**, wenn die Kapazität nicht reicht | Einplanung strikt nach Eingang, Warteliste mit Platz X von Y, „Kunde informieren“ bzw. intern eskalieren, wenn es keine Lösung gibt | [Priorität](docs/03-planung-und-regeln.md#die-regeln--umsetzung-und-nachweis) |
| „Lieber wenige Kernfunktionen sauber als alles halb“ | Bewusst schlank: eine Woche, drei Eingriffe (Verschieben, Fixieren, Herausnehmen), Eskalation für Fälle ohne Lösung. 71 automatisierte Tests, Architektur-Wächter in CI | [Architektur](docs/02-architektur.md) · [Tests](docs/06-tests-und-qualitaet.md) |

### Bewusste Annahmen

Die vollständige Liste steht in der App unter **Hilfe → Annahmen**. Die wichtigsten:

- **`customerAvailableFrom = null` heißt „ganztägig verfügbar“.** Das Feld ist laut API „string oder null“ und definiert nur, dass ein Termin *nicht früher* beginnen darf. Ohne Wert gibt es keine Untergrenze. Fehlt die Zeit, ist das daher kein Datenfehler, sondern der Normalfall (im Datensatz bei der Mehrheit der Anfragen). Mit einer Freigabe steht der Termin fest; eine erneute Bestätigung durch den Kunden ist nicht vorgesehen. Vertriebsnotizen (37 Freitexte) werden **angezeigt, nicht ausgewertet** – in der Tagesroute direkt beim Termin. Harte Zeitgrenze ist nur `customerAvailableFrom`; bewusst ohne KI, denn die Aufgabe ist, den Planer zu entlasten, nicht ihn zu ersetzen.
- **Geplant wird eine Woche** (23.–27.11.). Was keinen Platz hat, steht auf der Warteliste (älteste zuerst) – Mehrwochen-Planung steht unter [mit mehr Zeit](docs/08-trade-offs-und-ausblick.md).
- **Uhrzeit im falschen Format** (z. B. „10.00“, „10 Uhr“) wird eindeutig als 10:00 gelesen und geplant – gelbe Warnung mit Korrektur per Klick. Nur unlesbare Werte (z. B. „morgens“) sind ein Datenfehler.

---

## Architektur in 30 Sekunden

```mermaid
flowchart LR
  subgraph WEB["web · React"]
    direction TB
    V["Views<br/><small>Seiten & Komponenten</small>"] --> CORE["CoreInteractor<br/><small>Fassade</small>"]
    CORE --> MOD["Modul-Interactors<br/><small>Techniker · Termine · Anfragen · Routen · System</small>"]
    MOD --> AS["ApiService<br/><small>generisch</small>"]
    DS["Design-System<br/><small>Tokens → Komponenten</small>"] -.-> V
  end
  subgraph API["api · Node/Express"]
    direction TB
    R["Routen"] --> VAL["Validierung"] --> PL["Planer"] --> VER["Prüfung<br/><small>unabhängig</small>"]
  end
  AS -->|"/api/*"| R
  API -->|"Bearer-Token"| H[("Heizma<br/>Case-Study-API")]

  classDef ds fill:#EEEDFE,stroke:#534AB7,color:#3C3489
  classDef inter fill:#E1F5EE,stroke:#0F6E56,color:#085041
  classDef svc fill:#FAECE7,stroke:#993C1D,color:#712B13
  class DS ds
  class CORE,MOD inter
  class AS svc
```

- **Backend:** Plant serverseitig und rechnet jeden Plan mit **eigenem, unabhängigem Code** nach (Vier-Augen-Prinzip). Der Heizma-Token verlässt nie den Server.
- **Frontend:** Clean Architecture im MVVM-Stil (verwandt mit **VIPER**): Views sprechen nur mit dem `CoreInteractor`, jedes Modul kennt nur seine Daten, nur der `ApiService` ruft `fetch` auf. Abhängigkeiten zeigen nach unten, Daten fließen nach oben.
- **Design-System:** Farben, Radien und Ebenen als Tokens in **einer** CSS-Datei. Tailwind und die Karten lesen dieselben Variablen.
- **Regeln werden erzwungen**, nicht nur dokumentiert: `npm run check:architecture` schlägt fehl, sobald eine View `fetch` aufruft oder eine Hex-Farbe fest codiert.

→ [Ausführlich: Architektur](docs/02-architektur.md)

---

## Schnellstart

```bash
cp .env.example .env        # HEIZMA_API_TOKEN eintragen – oder DATA_SOURCE=mock für offline
docker compose up --build   # → http://localhost:8080
```

Login: `planner@heizma.at` / `1nvite0nly` · Lokale Entwicklung, alle Befehle und Umgebungsvariablen: [Setup](docs/09-setup.md)

| Befehl | Zweck |
|---|---|
| `npm run dev` | API + Web mit Hot Reload |
| `npm run check` | Typecheck + Architektur-Wächter + Code-Navigation + alle Tests |
| `npm run test:coverage` | Tests mit Coverage-Report (API + Web) |
| `npm run code:index` | Code-Landkarte: Dateien, Abschnitte, Tags ([Code-Navigation](docs/10-code-navigation.md)) |
| `npm run check:code-index` | Gate für die Code-Navigation (läuft auch in der CI) |

---

## Dokumentation

| | Seite | Inhalt |
|---|---|---|
| 1 | [Aufgabe & Ergebnis](docs/01-aufgabe-und-ergebnis.md) | Problemverständnis, Ablauf für den Planer, Screenshots |
| 2 | [Architektur](docs/02-architektur.md) | Systemüberblick, Frontend-Schichten (Interactor/VIPER), Datenfluss, Ordnerstruktur |
| 3 | [Planung & Regeln](docs/03-planung-und-regeln.md) | Algorithmus, Fahrzeiten, jede Regel mit Umsetzung und Nachweis |
| 4 | [Datenqualität](docs/04-datenqualitaet.md) | Umgang mit unsauberen Daten, Korrekturen, Eskalation, Notizen |
| 5 | [Design-System](docs/05-design-system.md) | Tokens, Komponenten-Katalog, Styling-Regeln |
| 6 | [Tests & Qualität](docs/06-tests-und-qualitaet.md) | Teststrategie, Coverage, Architektur-Wächter, visueller Vergleich |
| 7 | [API-Referenz](docs/07-api.md) | Alle Endpunkte der eigenen API |
| 8 | [Trade-offs & Ausblick](docs/08-trade-offs-und-ausblick.md) | Trade-offs und was ich mit mehr Zeit machen würde |
| 9 | [Setup](docs/09-setup.md) | Installation, Docker, Konfiguration, Mock-Modus |
| 10 | [Code-Navigation](docs/10-code-navigation.md) | Dateiköpfe, `MARK`-Abschnitte, Tags (`REGEL-1…8`, `DATEN`, `TRADE-OFF` …), Regel-Index, `npm run code:index` |
