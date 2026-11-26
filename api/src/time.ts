/**
 * @file      time.ts – Zeit-Helfer: HH:MM ⇄ Minuten, ISO splitten, Uhrzeitformate normalisieren (DATEN: „10.00“ → 10:00)
 * @layer     Backend · Domäne (reine Funktionen)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
// Zeit-Helfer: intern wird in Minuten seit Mitternacht (Europe/Vienna) gerechnet

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function toHHMM(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function isValidHHMM(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Typische Schreibweisen einer Uhrzeit eindeutig in HH:MM übersetzen – wie ein Zahlenformat-Fehler (Int/Double):
 * „10.00“, „10,00“, „10h“, „10 Uhr“, „ab 10:00“, „9:30“, „1000“, „10:00:00“ → „10:00“.
 * Nicht eindeutig oder außerhalb 00:00–23:59 → null (bleibt Datenfehler).
 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (value == null) return null;
  const v = value.trim().toLowerCase().replace(/^ab\s*/, '').replace(/\s*(uhr|h)$/, '').trim();
  let m = v.match(/^(\d{1,2})(?:[:.,h](\d{2}))?(?::\d{2})?$/) ?? v.match(/^(\d{2})(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** "2026-11-23T10:00:00+01:00" → { date: "2026-11-23", minutes: 600 } (Wiener Ortszeit aus dem String) */
export function splitIso(iso: string): { date: string; minutes: number } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) throw new Error(`Ungültiges ISO-Datum: ${iso}`);
  return { date: match[1], minutes: Number(match[2]) * 60 + Number(match[3]) };
}
