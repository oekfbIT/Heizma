#!/usr/bin/env node
/**
 * @file      code-index.mjs – Code-Landkarte: listet alle Navigations-Marker im Quellcode
 * @layer     Werkzeug (keine Abhängigkeiten)
 * @siehe     docs/10-code-navigation.md
 *
 *   npm run code:index                 → Dateien mit @file-Zeile + alle MARK-Abschnitte
 *   npm run code:index -- REGEL-3      → nur Fundstellen eines Tags (z. B. REGEL-3, DATEN, TRADE-OFF)
 *   npm run code:index -- tags         → Übersicht: wie oft kommt welcher Tag wo vor
 *   npm run code:index -- check        → CI-Gate: bricht ab (Exit 1), wenn Konventionen verletzt sind (siehe unten)
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const DIRS = ['api/src', 'web/src', 'scripts'];
const TAGS = ['REGEL-1', 'REGEL-2', 'REGEL-3', 'REGEL-4', 'REGEL-5', 'REGEL-6', 'REGEL-7', 'REGEL-8', 'DATEN', 'ANNAHME', 'TRADE-OFF', 'ACHTUNG', 'SICHERHEIT', 'KI', 'AUSBLICK', 'EINSTIEG', 'GRUND-PRAEFIX'];

const SELF = 'scripts/code-index.mjs';
const SKIP = new Set(['node_modules', 'fixtures', 'dist', '.test-dist']);
const files = [];
function walk(dir) {
  let names;
  try { names = readdirSync(dir); } catch { return; } // Ordner fehlt → überspringen
  for (const name of names) {
    const p = join(dir, name);
    if (SKIP.has(name) || name.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|css)$/.test(name) && relative(ROOT, p) !== SELF) files.push(p);
  }
}
for (const d of DIRS) walk(join(ROOT, d));

const rel = (p) => relative(ROOT, p);
const isTest = (p) => rel(p).includes('__tests__/');
const arg = process.argv[2];
const isComment = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l) || /\s\/\/\s/.test(l);

// MARK: - CI-Gate (`-- check`)
// Prüft: 1) jede Datei hat @file, @layer, @siehe im Kopf
//        2) jede Case-Regel REGEL-1…8 kommt in Umsetzung (planner/validation), Prüfung (verify.ts) und Test vor
//        3) keine unbekannten Regel-Nummern (Tippfehler wie REGEL-9)
//        4) docs/10-code-navigation.md existiert und nennt jeden Tag aus TAGS
function runCheck() {
  const errors = [];
  const src = new Map(files.map((f) => [rel(f), readFileSync(f, 'utf8')]));
  for (const [f, s] of src) {
    const head = s.split('\n').slice(0, 12).join('\n');
    for (const field of ['@file', '@layer', '@siehe']) if (!head.includes(field)) errors.push(`${f}: Dateikopf ohne ${field}`);
    s.split('\n').forEach((l, i) => { const m = /\bREGEL-(\d+)\b/.exec(l); if (m && (+m[1] < 1 || +m[1] > 8)) errors.push(`${f}:${i + 1}: unbekannte Regel REGEL-${m[1]}`); });
  }
  const has = (pred, tag) => [...src].some(([f, s]) => pred(f) && new RegExp(`\\b${tag}\\b`).test(s));
  for (let n = 1; n <= 8; n++) {
    const t = `REGEL-${n}`;
    if (!has((f) => /api\/src\/(planner|validation)\.ts$/.test(f), t)) errors.push(`${t}: keine Umsetzung markiert (planner.ts/validation.ts)`);
    if (!has((f) => f.endsWith('api/src/verify.ts'), t)) errors.push(`${t}: keine Prüfung markiert (verify.ts)`);
    if (!has((f) => f.includes('__tests__/'), t)) errors.push(`${t}: kein Test markiert (__tests__)`);
  }
  let doc = '';
  try { doc = readFileSync(join(ROOT, 'docs/10-code-navigation.md'), 'utf8'); } catch { errors.push('docs/10-code-navigation.md fehlt'); }
  if (doc) for (const t of TAGS) if (!/^REGEL-/.test(t) && !doc.includes(t)) errors.push(`docs/10-code-navigation.md: Tag ${t} nicht dokumentiert`);
  if (errors.length) {
    console.error(`✗ Code-Navigation: ${errors.length} Problem(e)\n  ${errors.join('\n  ')}`);
    process.exit(1);
  }
  console.log(`✓ Code-Navigation: ${files.length} Dateien mit Kopf · REGEL-1…8 je in Umsetzung, Prüfung und Test · Tags dokumentiert`);
}

if (arg === 'check') runCheck();
else if (arg === 'tags') {
  const count = new Map(TAGS.map((t) => [t, new Map()]));
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l) => {
    if (!isComment(l)) return;
    for (const t of TAGS) if (new RegExp(`\\b${t}\\b`).test(l)) count.get(t).set(rel(f), (count.get(t).get(rel(f)) ?? 0) + 1);
  });
  for (const [t, m] of count) console.log(`${t.padEnd(11)} ${String([...m.values()].reduce((a, b) => a + b, 0)).padStart(3)}×  ${[...m.entries()].map(([f, n]) => `${f}(${n})`).join(', ')}`);
} else if (arg) {
  const re = new RegExp(`\\b${arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (isComment(l) && re.test(l)) console.log(`${rel(f)}:${i + 1}  ${l.trim()}`); });
} else {
  for (const f of files.filter((x) => !isTest(x)).sort()) {
    const lines = readFileSync(f, 'utf8').split('\n');
    const head = lines.find((l) => l.includes('@file'));
    console.log(`\n${rel(f)}${head ? `  — ${head.split('–').slice(1).join('–').trim()}` : ''}`);
    lines.forEach((l, i) => { const m = /MARK: (-\s*)?(.+?)(\s*\*\/\})?$/.exec(l); if (m) console.log(`  ${String(i + 1).padStart(4)}  ${m[1] ? '' : '  '}${m[2].trim()}`); });
  }
}
