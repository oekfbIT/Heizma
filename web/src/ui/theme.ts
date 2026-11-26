/**
 * Brücke von den Design-Tokens (ui/styles/tokens.css) zu JavaScript.
 * Karten (Google Maps, Leaflet) brauchen echte Farbwerte statt CSS-Klassen –
 * sie lesen dieselben CSS-Variablen, damit es nur eine Quelle der Wahrheit gibt.
 */

/** Anzahl der Routenfarben in tokens.css (--color-route-1 … --color-route-8) */
export const ROUTE_COLOR_COUNT = 8;

/** Token als Hex-Farbe. Ohne DOM (Tests, SSR) die CSS-Variable selbst. */
export function tokenColor(name: string): string {
  if (typeof document === 'undefined') return `var(${name})`;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw ? channelsToHex(raw) : `var(${name})`;
}

/** "77 165 71" → "#4da547" (Tokens sind als RGB-Kanäle gespeichert, damit Tailwind-Opacity funktioniert) */
export function channelsToHex(channels: string): string {
  const parts = channels.split(/[\s,]+/).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return channels;
  return `#${parts
    .slice(0, 3)
    .map((n) => Math.round(n).toString(16).padStart(2, '0'))
    .join('')}`;
}

export const routeColor = (index: number) => tokenColor(`--color-route-${(index % ROUTE_COLOR_COUNT) + 1}`);

/** Häufig gebrauchte Kartenfarben */
export const mapColors = () => ({
  brand: tokenColor('--color-brand-500'),
  ink: tokenColor('--color-ink'),
  muted: tokenColor('--color-gray-400'),
  white: tokenColor('--color-white'),
});
