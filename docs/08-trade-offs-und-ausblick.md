[← 7 API-Referenz](07-api.md) · **8 Trade-offs & Ausblick** · [9 Setup →](09-setup.md)

# Trade-offs & Ausblick

## Bewusste Entscheidungen

| Entscheidung | Gewonnen | Bezahlt |
|---|---|---|
| **Heuristik statt Solver** (Greedy + 2-opt/Relocate) | < 1 s, nachvollziehbar, jede Regel in einer Simulation | Nicht beweisbar optimal |
| **Fahrzeit symmetrisch** (A→B ≈ B→A) | Halb so viele Calls an `/travel/path` | Kleine Abweichungen bei Einbahnen |
| **Keine Tageszeit-Abhängigkeit** | Eine Matrix für die ganze Woche | Kein Berufsverkehr, kein Puffer pro Stopp |
| **„Ältere zuerst“ über die Einplanungsreihenfolge** | Einfach und prüfbar | Eine jüngere Anfrage bekommt einen Platz, in den die ältere nicht passte (Ort/Fenster) – die Prüfung weist das als Hinweis aus |
| **KI nur als Vorschlag** | Mensch entscheidet, Planung bleibt deterministisch | Ein Klick mehr für den Planer |
| **Lokale JSON-Datei statt Datenbank** | Keine Infrastruktur, sofort lauffähig | Nicht für mehrere Instanzen; auf Vercel unter `/tmp` nicht dauerhaft |
| **Benachrichtigungen simuliert** | Fokus auf die Planung | Es wird nichts versendet |
| **`/api/stammdaten` als ein Endpunkt** | Ein Request für alle Module | Modul-Interactors schneiden ihren Teil heraus, statt eigene Endpunkte zu haben |
| **Unit-Tests statt Komponenten-Tests im Web** | Logik schnell und isoliert geprüft | Views nur durch Typecheck, Pixel-Vergleich und manuelle Abläufe abgesichert |

## Grenzen dieser Version

- **Keine Rückgängig-Funktion nach Veröffentlichung.** In Produktion hieße das Absagen an Kunden und Außendienst. Im Prototyp entsperrt „Freigabe zurücknehmen“ nur die Route.
- **Ein Planer, keine Rollen.** Das Änderungsprotokoll kennt kein „wer“.
- **Fixe Termine sind nicht bearbeitbar** (laut Case nicht verschiebbar); Konflikte werden nur gemeldet.
- **Mock-Login** mit einem festen Zugang – bewusst ohne externe Dienste.

## Was ich mit mehr Zeit machen würde

**Planung**
1. **Gleichmäßigere Auslastung** als zweites Ziel neben der Fahrzeit (Balancing über die Woche).
2. **Tageszeit-abhängige Fahrzeiten** und ein Puffer pro Stopp.
3. **VRPTW-Solver** (z. B. OR-Tools) als Alternative für größere Mengen – die Prüfung bliebe dieselbe.

**Daten**
4. **Adress-Tippfehler per LLM + Geocoding vorschlagen** (mit Freigabe), statt nur zu markieren.
5. **Schreibende Anbindung an CRM und Kalender** statt lokaler JSON-Datei – derselbe `PATCH`-Endpunkt.

**Bedienung**
6. **Drag & Drop** auf Karte und Zeitleiste als zweiter Weg zu „Verschieben“ (gleiche Endpunkte).
7. **Rollen und Benutzer** im Änderungsprotokoll.

**Qualität**
8. **Playwright-End-to-End-Tests** für die Hauptabläufe in CI (der visuelle Vergleich existiert schon als Skript).
9. **Ein Endpunkt pro Modul** (`/api/techniker`, `/api/anfragen` …), damit jedes Interactor-Modul nur seine Daten lädt.
10. **Mock-Server für die Heizma-API**, um `heizmaClient` und `travelMatrix` zu testen.

---

[← 7 API-Referenz](07-api.md) · [9 Setup →](09-setup.md)
