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

/** "2026-11-23T10:00:00+01:00" → { date: "2026-11-23", minutes: 600 } (Wiener Ortszeit aus dem String) */
export function splitIso(iso: string): { date: string; minutes: number } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!match) throw new Error(`Ungültiges ISO-Datum: ${iso}`);
  return { date: match[1], minutes: Number(match[2]) * 60 + Number(match[3]) };
}
