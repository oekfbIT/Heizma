/**
 * @file      timeWish.ts – Zeitwunsch aus Vertriebsnotiz – deterministisch, ohne KI (REGEL-4 nach Bestätigung)
 * @layer     Backend · Domäne (reine Funktionen)
 * @siehe     docs/04-datenqualitaet.md · docs/10-code-navigation.md
 */
// DATEN · ANNAHME: Zeitwunsch aus der Vertriebsnotiz – deterministisch per Regeln, ohne KI.
// Ergebnis ist ein internes, strukturiertes Feld: der Planer bestätigt oder verwirft es, erst dann wird automatisch geplant.

export interface TimeWish {
  /** „nur“/„erreichbar“ = muss; „besser“/„lieber“ = Wunsch */
  kind: 'only' | 'preference';
  hint: string;
  earliest?: string;
  latest?: string;
  note: string;
}

const hh = (h: string, m?: string) => `${h.padStart(2, '0')}:${m ?? '00'}`;

export function parseTimeWish(note: string | null | undefined): TimeWish | null {
  if (!note) return null;
  const n = note.toLowerCase();
  const kind: TimeWish['kind'] = /besser|lieber|bevorzugt|wenn möglich|am liebsten|ideal/.test(n) ? 'preference' : 'only';
  const label = kind === 'only' ? 'Nur' : 'Lieber';
  if (/vormittag|morgens|\bvorm\./.test(n)) return { kind, hint: `${label} vormittags`, latest: '12:00', note };
  if (/nachmittag|\bnachm\./.test(n)) return { kind, hint: `${label} nachmittags`, earliest: '12:00', note };
  const from = n.match(/(?:ab|nach)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr|h)\b/);
  const until = n.match(/(?:bis|vor)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(?:uhr|h)\b/);
  if (!from && !until) return null;
  const earliest = from ? hh(from[1], from[2]) : undefined;
  const latest = until ? hh(until[1], until[2]) : undefined;
  return { kind, hint: [earliest && `ab ${earliest}`, latest && `bis ${latest}`].filter(Boolean).join(' '), earliest, latest, note };
}
