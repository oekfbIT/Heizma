/**
 * @file      validation.ts – Datenqualität: Befunde (Fehler / Warnung / Hinweis) + Zuständigkeitsregel
 * @layer     Backend · Domäne (reine Funktionen)
 * @einstieg  validateDataset() → Liste von Issues · eligibleTechnicians() → REGEL-5
 * @genutzt   planner.ts (Zuständigkeit, blockierende Fehler), verify.ts, index.ts (Stammdaten-Ansicht im Web)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 *
 * Severity-Logik:  error → Anfrage wird NICHT geplant, bis korrigiert · warning → wird geplant, Hinweis im UI
 *                  info → nur zur Kenntnis (z. B. Notiz vorhanden, Tag gesperrt)
 * Neuen Datenfehler-Typ hinzufügen: hier `push(...)` mit eindeutigem `code`, dann im Web IssueBadge/Texte prüfen.
 */
import { haversineKm, hasCoords, pointInPolygon } from './geo.js';
import { isValidHHMM, normalizeTime, splitIso, toMinutes } from './time.js';
import type { Dataset, Issue, ServiceRequest, Technician } from './types.js';

const EXPECTED_DURATION: Record<string, number> = { PV: 60, WP: 75, 'WP+PV': 105 };
export const RADIUS_FALLBACK_KM = 15;

// MARK: - Zuständigkeit (REGEL-5)

/**
 * REGEL-5 · Zuständigkeitsregel: Gebiet → sonst Wohnort ≤ 15 km → sonst nicht zuordenbar
 * ANNAHME: Überlappende Gebiete → alle betroffenen Personen sind zuständig; der Planer wählt die günstigste Route.
 * DATEN: Person ohne Gebiet (tech_07) → nur über den 15-km-Umkreis zuständig.
 */
export function eligibleTechnicians(request: ServiceRequest, technicians: Technician[]): Technician[] {
  if (!hasCoords(request)) return [];
  const byRegion = technicians.filter((t) => pointInPolygon(request, t.region));
  if (byRegion.length) return byRegion;
  return technicians.filter((t) => haversineKm(request, t.home) <= RADIUS_FALLBACK_KM);
}

// MARK: - Datensatz-Validierung (EINSTIEG)

export function validateDataset(data: Dataset): Issue[] {
  const issues: Issue[] = [];
  const techIds = new Set(data.technicians.map((t) => t.id));

  // MARK: Techniker – DATEN: ohne Gebiet (tech_07), ohne Verfügbarkeit (tech_06)
  for (const t of data.technicians) {
    const entries = data.availability.filter((a) => a.technicianId === t.id);
    const usable = entries.filter((a) => !a.blocked);
    if (!t.region || t.region.length < 3) {
      issues.push({
        entity: 'technician', entityId: t.id, field: 'region', severity: 'warning', code: 'NO_REGION',
        message: 'Kein Einsatzgebiet hinterlegt – nur Anfragen im 15-km-Umkreis des Wohnorts zuordenbar.',
      });
    }
    if (!entries.length) {
      issues.push({
        entity: 'technician', entityId: t.id, field: 'availability', severity: 'error', code: 'NO_AVAILABILITY',
        message: `Keine Verfügbarkeit im Zeitraum ${data.range.from} – ${data.range.to}. Person wird nicht eingeplant.`,
      });
    } else if (!usable.length) {
      issues.push({
        entity: 'technician', entityId: t.id, field: 'availability', severity: 'warning', code: 'ALL_BLOCKED',
        message: 'Alle Tage im Zeitraum gesperrt (Urlaub/Krank).',
      });
    }
    if (!Number.isFinite(t.home?.lat) || !Number.isFinite(t.home?.lng)) {
      issues.push({
        entity: 'technician', entityId: t.id, field: 'home', severity: 'error', code: 'NO_HOME',
        message: 'Wohnort ohne Koordinaten – Tagesroute kann nicht berechnet werden.',
      });
    }
  }

  // MARK: Verfügbarkeiten
  for (const a of data.availability) {
    const id = `${a.technicianId}@${a.date}`;
    if (!techIds.has(a.technicianId)) {
      issues.push({ entity: 'availability', entityId: id, field: 'technicianId', severity: 'error', code: 'UNKNOWN_TECH', message: `Unbekannter Außendienstler ${a.technicianId}.` });
    }
    if (!isValidHHMM(a.start) || !isValidHHMM(a.end) || toMinutes(a.start) >= toMinutes(a.end)) {
      issues.push({ entity: 'availability', entityId: id, field: 'start', severity: 'error', code: 'BAD_WINDOW', message: `Ungültiges Zeitfenster ${a.start}–${a.end}.` });
    }
    if (a.blocked) {
      issues.push({ entity: 'availability', entityId: id, field: 'blocked', severity: 'info', code: 'BLOCKED', message: 'Tag gesperrt (Urlaub/Krank).' });
    }
  }

  // MARK: Anfragen – DATEN: fehlende Koordinaten, Tippfehler, unbekannter Typ, Uhrzeitformat, außerhalb aller Gebiete, Notizen
  for (const r of data.requests) {
    const push = (field: string, severity: Issue['severity'], code: string, message: string, suggestion?: string) =>
      issues.push({ entity: 'request', entityId: r.id, field, severity, code, message, ...(suggestion ? { suggestion } : {}) });

    if (!hasCoords(r)) {
      push('lat', 'error', 'NO_COORDS', 'Koordinaten fehlen – die Adresse muss geokodiert werden.');
    }
    // TRADE-OFF: einfache PLZ-Heuristik (4 Ziffern). Tippfehler im Ortsnamen findet erst geocode.ts.
    if (!/\b\d{4}\b/.test(r.address)) {
      push('address', 'warning', 'ADDRESS_NO_ZIP', 'Adresse ohne gültige PLZ – möglicher Tippfehler.');
    }
    if (r.visitationType === null) {
      push('visitationType', 'warning', 'NO_TYPE', 'Besichtigungstyp unbekannt – 105 min angenommen.');
    } else if (EXPECTED_DURATION[r.visitationType] !== r.durationMinutes) {
      push('durationMinutes', 'warning', 'DURATION_MISMATCH', `Dauer ${r.durationMinutes} min passt nicht zum Typ ${r.visitationType} (erwartet ${EXPECTED_DURATION[r.visitationType]} min).`);
    }
    if (r.customerAvailableFrom !== null && !isValidHHMM(r.customerAvailableFrom)) {
      const fixed = normalizeTime(r.customerAvailableFrom);
      // Eindeutiges Format-Problem (wie Int/Double): automatisch gelesen und geplant, Korrektur per Klick
      if (fixed) push('customerAvailableFrom', 'warning', 'TIME_FORMAT', `Uhrzeit „${r.customerAvailableFrom}“ als ${fixed} gelesen und so geplant – bitte übernehmen.`, fixed);
      else push('customerAvailableFrom', 'error', 'BAD_TIME', `Ungültige Uhrzeit „${r.customerAvailableFrom}“ (erwartet HH:MM) – nicht eindeutig lesbar.`);
    }
    if (hasCoords(r) && eligibleTechnicians(r, data.technicians).length === 0) {
      push('address', 'error', 'NOT_ASSIGNABLE', 'Außerhalb aller Einsatzgebiete und > 15 km von jedem Wohnort – nicht zuordenbar.');
    }
    if (r.notes) {
      push('notes', 'info', 'HAS_NOTES', `Notiz aus dem Vertrieb prüfen: „${r.notes}“`);
    }
  }

  // MARK: Fixe Termine – REGEL-6: werden nie verschoben, nur Konflikte gemeldet
  for (const ap of data.appointments) {
    const push = (field: string, severity: Issue['severity'], code: string, message: string) =>
      issues.push({ entity: 'appointment', entityId: ap.id, field, severity, code, message });
    if (!techIds.has(ap.technicianId)) push('technicianId', 'error', 'UNKNOWN_TECH', `Unbekannter Außendienstler ${ap.technicianId}.`);
    const { date, minutes: start } = splitIso(ap.start);
    const end = splitIso(ap.end).minutes;
    const avail = data.availability.find((a) => a.technicianId === ap.technicianId && a.date === date);
    if (!avail) {
      push('start', 'error', 'OUTSIDE_AVAILABILITY', `Außendienstler hat am ${date} keine Verfügbarkeit.`);
    } else if (avail.blocked) {
      push('start', 'error', 'TECH_BLOCKED', `Außendienstler ist am ${date} gesperrt – Termin muss umgeplant werden.`);
    } else if (start < toMinutes(avail.start) || end > toMinutes(avail.end)) {
      push('start', 'warning', 'OUTSIDE_WINDOW', `Termin liegt außerhalb des Verfügbarkeitsfensters ${avail.start}–${avail.end}.`);
    }
    const overlapping = data.appointments.find((o) => {
      if (o.id === ap.id || o.technicianId !== ap.technicianId) return false;
      const os = splitIso(o.start);
      return os.date === date && os.minutes < end && splitIso(o.end).minutes > start;
    });
    if (overlapping) push('start', 'error', 'OVERLAP', `Überschneidet sich mit ${overlapping.id}.`);
  }

  return issues;
}
