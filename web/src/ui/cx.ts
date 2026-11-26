/**
 * @file      cx.ts – className-Helfer
 * @layer     Web · Design-System
 * @siehe     docs/05-design-system.md · docs/10-code-navigation.md
 */
/** className-Helfer: verbindet Klassen, ignoriert false/null/undefined */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
