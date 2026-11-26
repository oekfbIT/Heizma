[← 7 API-Referenz](07-api.md) · **8 Trade-offs & Ausblick** · [9 Setup →](09-setup.md)

# Trade-offs & Ausblick

## Bewusste Entscheidungen

| Entscheidung | Gewonnen | Bezahlt |
|---|---|---|
| **Heuristik statt Solver** (Greedy + 2-opt/Relocate) | < 1 s, nachvollziehbar, jede Regel in einer Simulation | Nicht beweisbar optimal |
| **Fahrzeit symmetrisch** (A→B ≈ B→A) | Halb so viele Calls an `/travel/path` | Kleine Abweichungen bei Einbahnen |
| **Keine Tageszeit-Abhängigkeit** | Eine Matrix für die ganze Woche | Kein Berufsverkehr, kein Puffer pro Stopp |
| **„Ältere zuerst“ über die Einplanungsreihenfolge** | Einfach und prüfbar | Eine jüngere Anfrage bekommt einen Platz, in den die ältere nicht passte (Ort/Fenster) – die Prüfung weist das als Hinweis aus |
| **Notizen nicht automatisch auswerten (keine KI)** | Außerhalb des Auftrags; Planer entscheidet, Planung bleibt deterministisch | Ein Zeitwunsch in einer Notiz kann zunächst falsch eingeplant sein – der Planer sieht die Notiz beim Termin und verschiebt |
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
4. **Mehrere Wochen planen.** Heute ist der Planungszeitraum fest auf eine Woche (23.–27.11.) eingestellt; was diese Woche keinen Platz hat, wird bereits in die Folgewochen **vorgeplant** (vorläufig, Status „Vorgeplant KW …“, Wochen-Umschalter im Planer). Annahme: Die Verfügbarkeit der Folgewochen käme aus der API; bis dahin gelten die Zeiten dieser Woche. Nächster Schritt: Woche per Pfeil/Auswahl wechseln (Übersicht, Anfragen, Kartenansicht samt Seitenleiste). Die Planung einer Woche startet dann mit dem, was übrig bleibt: freigegebene Routen der Vorwoche bleiben gesperrt, ihre Anfragen gelten als erledigt, die Warteliste rückt in die nächste Woche nach – weiterhin „ältere zuerst“.
5. **Prüfung gesperrter Routen beim Wochenwechsel.** Freigegebene Routen werden erneut gegen den aktuellen Datenstand geprüft (z. B. Verfügbarkeit nachträglich gesperrt, fixer Termin verschoben). Konflikte erscheinen als Handlungsbedarf, statt still bestehen zu bleiben.

**Daten**
6. **Adress-Tippfehler per LLM + Geocoding vorschlagen** (mit Freigabe), statt nur zu markieren.
7. **Zeitwünsche aus Notizen als eigenes Feature** – z. B. ein strukturiertes Feld „Kunde erreichbar bis“ im Vertrieb, statt Freitext nachträglich zu deuten. Bis dahin sieht der Planer die Notiz beim Termin.
8. **Schreibende Anbindung an CRM und Kalender** statt lokaler JSON-Datei – derselbe `PATCH`-Endpunkt.

**Bedienung**
9. **Drag & Drop** auf Karte und Zeitleiste als zweiter Weg zu „Verschieben“ (gleiche Endpunkte).
10. **Rollen und Benutzer** im Änderungsprotokoll.

**Qualität**
11. **Playwright-End-to-End-Tests** für die Hauptabläufe in CI (der visuelle Vergleich existiert schon als Skript).
12. **Ein Endpunkt pro Modul** (`/api/techniker`, `/api/anfragen` …), damit jedes Interactor-Modul nur seine Daten lädt.
13. **Mock-Server für die Heizma-API**, um `heizmaClient` und `travelMatrix` zu testen.

---

[← 7 API-Referenz](07-api.md) · [9 Setup →](09-setup.md)
