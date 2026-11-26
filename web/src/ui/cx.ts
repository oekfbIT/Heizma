/** className-Helfer: verbindet Klassen, ignoriert false/null/undefined */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
