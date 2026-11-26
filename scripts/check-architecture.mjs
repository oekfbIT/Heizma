#!/usr/bin/env node
/**
 * Architektur-Wächter: prüft die Schichtregeln des Frontends.
 * Läuft in Sekunden, ohne Abhängigkeiten – gedacht für CI und vor jedem Commit.
 *
 *   node scripts/check-architecture.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../web/src/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|css)$/.test(name)) files.push(p);
  }
})(ROOT);

const rel = (p) => relative(ROOT, p);
const isTest = (p) => rel(p).startsWith('__tests__/');
const inUi = (p) => rel(p).startsWith('ui/');
const isView = (p) => /^(pages|components)\//.test(rel(p));

const RULES = [
  {
    name: 'Nur der ApiService ruft fetch auf (Ausnahme: Login vor der Sitzung)',
    test: (p, src) => !isTest(p) && !['core/ApiService.ts', 'core/auth.tsx'].includes(rel(p)) && /\bfetch\(/.test(src),
  },
  {
    name: 'Views greifen nie direkt auf den ApiService zu – nur über den CoreInteractor',
    test: (p, src) => isView(p) && /ApiService/.test(src),
  },
  {
    name: 'Keine alten Datenzugriffe (useApi, apiGet, apiSend, lib/api)',
    test: (p, src) => !isTest(p) && /\b(useApi|apiGet|apiSend|downloadFile|reloadData)\b|lib\/api'/.test(src),
  },
  {
    name: 'Keine fest codierten Hex-Farben außerhalb des Design-Systems',
    test: (p, src) => !inUi(p) && !isTest(p) && /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z-])/.test(src.replace(/&#\d+;/g, '')),
  },
  {
    name: 'Nur Token-Farben: danger/warning/info/accent statt red/amber/sky/violet',
    test: (p, src) => !inUi(p) && /-(red|amber|sky|violet|emerald|rose|orange|yellow|blue|green|indigo|purple)-\d{2,3}\b/.test(src),
  },
  {
    name: 'Keine Alt-Klassen (btn-primary, btn-secondary) und keine selbstgebauten Dialog-Overlays',
    test: (p, src) => !inUi(p) && /btn-primary|btn-secondary|fixed inset-0 z-modal/.test(src),
  },
];

let failed = 0;
for (const rule of RULES) {
  const hits = files.filter((p) => rule.test(p, readFileSync(p, 'utf8'))).map(rel);
  console.log(`${hits.length ? '✗' : '✓'} ${rule.name}${hits.length ? `\n    ${hits.join('\n    ')}` : ''}`);
  failed += hits.length;
}
console.log(failed ? `\n${failed} Verstoß/Verstöße` : '\nArchitektur sauber.');
process.exit(failed ? 1 : 0);
