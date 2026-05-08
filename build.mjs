#!/usr/bin/env node
// Zero-dependency bundler. Reads index.html + every ES module under src/,
// produces a single self-contained dist/garden.html that runs by double-click
// or by hosting from anywhere static.
//
// Usage:  node build.mjs
//
// Design note: this is a deliberately small bundler tailored to *this*
// codebase. It assumes:
//   - all imports are static (no dynamic import())
//   - all imports are named (no default imports, no namespace imports)
//   - all exports are named (no default exports, no re-exports)
//   - no top-level await
// Don't extend it without revisiting these assumptions.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ENTRY    = 'src/main.js';
const HTML_IN  = 'index.html';
const CSS_IN   = 'styles/main.css';
const OUT_DIR  = 'dist';
const OUT_FILE = 'garden.html';

const IMPORT_RE     = /^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(const|let|function)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map();
const order = [];

function loadModule(id) {
  if (modules.has(id)) return;
  modules.set(id, null);   // placeholder to break any cycles

  const fullPath = resolve(ROOT, id);
  const src = readFileSync(fullPath, 'utf8');
  const deps = [];

  // Strip and capture imports.
  let body = src.replace(IMPORT_RE, (_m, names, importPath) => {
    const absId = relative(ROOT, resolve(dirname(fullPath), importPath));
    const parsed = names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [orig, alias] = s.split(/\s+as\s+/).map(t => t.trim());
      return { orig, alias: alias || orig };
    });
    deps.push({ id: absId, names: parsed });
    return '';
  });

  // Capture export names; rewrite `export X` → `X`.
  const exports = [];
  body = body.replace(EXPORT_DECL_RE, (_m, kind, name) => {
    exports.push(name);
    return `${kind} ${name}`;
  });

  modules.set(id, { body, deps, exports });

  for (const d of deps) loadModule(d.id);
  if (!order.includes(id)) order.push(id);
}

loadModule(ENTRY);

// ── Emit bundle ─────────────────────────────────────────────────────
const blocks = order.map(id => {
  const { body, deps, exports } = modules.get(id);
  const importLines = deps.map(d => {
    const fields = d.names.map(({ orig, alias }) =>
      orig === alias ? orig : `${orig}: ${alias}`
    ).join(', ');
    return `  const { ${fields} } = __mods[${JSON.stringify(d.id)}];`;
  }).join('\n');
  const exportLines = exports.map(n =>
    `  __mods[${JSON.stringify(id)}].${n} = ${n};`
  ).join('\n');

  return `// ── ${id} ──
{
  __mods[${JSON.stringify(id)}] = {};
${importLines}
${body}
${exportLines}
}`;
}).join('\n\n');

const bundle = `(() => {
'use strict';
const __mods = {};
${blocks}
})();
`;

// ── Inline into HTML ────────────────────────────────────────────────
const html = readFileSync(resolve(ROOT, HTML_IN), 'utf8');
const css  = readFileSync(resolve(ROOT, CSS_IN),  'utf8');

const inlined = html
  .replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\/main\.css"\s*>/,
    `<style>\n${css}\n</style>`,
  )
  .replace(
    /<script\s+type="module"\s+src="\.\/src\/main\.js"\s*><\/script>/,
    `<script>\n${bundle}\n</script>`,
  );

mkdirSync(resolve(ROOT, OUT_DIR), { recursive: true });
const outPath = resolve(ROOT, OUT_DIR, OUT_FILE);
writeFileSync(outPath, inlined);
console.log(`Built ${OUT_DIR}/${OUT_FILE}  (${(inlined.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
