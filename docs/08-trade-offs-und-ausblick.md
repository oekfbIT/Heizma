[← 7 API-Referenz](07-api.md) · **8 Trade-offs & Ausblick** · [9 Setup →](09-setup.md)

# Trade-offs & Ausblick

## Trade-offs

| Entscheidung | Gewonnen | Bezahlt |
|---|---|---|
| **Heuristik statt Solver** (Greedy *Cheapest Insertion* + 2-opt/Relocate) | < 1 s für die Woche, jeder Schritt nachvollziehbar, alle Regeln in einer Tages-Simulation | Nicht beweisbar optimal |
| **Fahrzeiten aus der Heizma-API** (`/travel/path`, 13 Fahrten pro Call, gecacht) | Echte Straßenfahrzeiten ohne eigenen Routing-Dienst | Symmetrisch angenommen (A→B = B→A), kein Berufsverkehr, kein Puffer pro Stopp |
| **„Ältere zuerst“ über Reihenfolge + Tausch-Durchgang** | Einfach und unabhängig prüfbar | Eine jüngere Anfrage kann einen Platz bekommen, in den die ältere nicht passt (Ort, Zeitfenster) – das ist regelkonform |
| **Handplanung als Vergleich** (älteste zuerst, nächste Person, hinten anhängen) | Die Ersparnis ist auf denselben Daten, Regeln und Fahrzeiten messbar | Vereinfachtes Modell eines Planers – echte Vergleichsdaten von Heizma gibt es nicht |
| **Automatisch neu planen per Abfrage** (Browser prüft alle 30 s den Inhaltsstand, Heizma-Daten max. 10 min gecacht) | Kein Button, keine Push-Infrastruktur; gleicher Stand wird nie neu gerechnet | Neue Heizma-Daten erscheinen mit bis zu 10 min Verzögerung |
| **Planer entscheidet, System schlägt vor** | Verschieben, Fixieren und Herausnehmen sind möglich; ein Regelbruch nur mit Begründung und sichtbar | Kein vollautomatischer Betrieb ohne Freigabe |
| **Notizen werden angezeigt, nicht ausgewertet** (keine KI) | Planung bleibt deterministisch und erklärbar | Ein Zeitwunsch in einer Notiz kann zunächst falsch eingeplant sein – der Planer sieht die Notiz beim Termin |
| **Eine Woche** (23.–27.11.) | Fokus auf die Kernaufgabe | Die Warteliste zeigt, was diese Woche nicht passt – keine Vorplanung der Folgewochen |
| **Lokale JSON-Datei statt Datenbank** | Keine Infrastruktur, sofort lauffähig | Auf Vercel je Serverless-Instanz unter `/tmp` – Eingriffe können verloren gehen |
| **Benachrichtigungen simuliert** | Fokus auf die Planung | Es wird nichts versendet |

## Was ich mit mehr Zeit machen würde

1. **Gleichmäßigere Auslastung** als zweites Ziel neben der Fahrzeit (Balancing über Personen und Tage).
2. **Tageszeit-abhängige Fahrzeiten** und ein Puffer pro Stopp.
3. **VRPTW-Solver** (z. B. OR-Tools) als Vergleich für größere Mengen – die unabhängige Prüfung bliebe dieselbe.
4. **Mehrere Wochen planen:** die Warteliste in die Folgewochen vorplanen, sobald deren Verfügbarkeit aus der API kommt.
5. **Datenbank** (z. B. Postgres/Redis) statt JSON-Datei – nötig für den Betrieb auf Vercel und für mehrere Planer.
6. **Adress-Tippfehler und fehlende Koordinaten per LLM + Geocoding vorschlagen** (mit Freigabe durch den Planer).
7. **Zeitwünsche aus Notizen** als strukturiertes Feld im Vertrieb („Kunde erreichbar bis“) statt Freitext.
8. **Echte Benachrichtigungen:** Terminbestätigung an Kunden, Tagesroute als Kalendereintrag an den Außendienst.
9. **Drag & Drop** auf Karte und Zeitleiste als zweiter Weg zum „Verschieben“.
10. **Playwright-End-to-End-Tests** für die Hauptabläufe in CI.

---

[← 7 API-Referenz](07-api.md) · [9 Setup →](09-setup.md)
