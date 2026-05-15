#!/usr/bin/env node
// Zero-dependency bundler. Reads index.html + every ES module under src/,
// produces a single self-contained HTML that runs by double-click or by
// hosting from anywhere static.
//
// Usage:  node build.mjs [--artifact]
//   default:    Output dist/garden.html (full bundle, JSON-shaped literals).
//   --artifact: Output artifact/garden.html. Strips the embedded dev image
//               and TOON-encodes specific assets so the pasted artifact
//               carries fewer tokens. Runtime still uses JSON; the decoder
//               in src/data/toonDecode.js rehydrates the literals on boot.
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
const ARTIFACT_MODE = process.argv.includes('--artifact');
const ENTRY    = 'src/main.js';
const HTML_IN  = 'index.html';
const CSS_IN   = 'styles/main.css';
const OUT_DIR  = ARTIFACT_MODE ? 'artifact' : 'dist';
const OUT_FILE = 'garden.html';

const IMPORT_RE     = /^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(const|let|function|async\s+function)\s+([A-Za-z_$][\w$]*)/gm;
const STRING_LIST_RE = /^const\s+([A-Z_][A-Z0-9_]*)\s*=\s*\[\s*((?:'[^'\n]*'\s*,?\s*)+)\];?\s*$/gm;

// Rewrite top-level `const FOO = ['a','b',...];` literals into
// `const FOO = decodeStringList('a,b,...');` and prepend an import of the
// decoder. The decoder lives in src/data/toonDecode.js. Used only by the
// artifact build to shave per-item quotes off long string arrays.
function toonifyStringLists(src) {
  let hadMatch = false;
  const rewritten = src.replace(STRING_LIST_RE, (_m, name, items) => {
    hadMatch = true;
    const values = [...items.matchAll(/'([^'\n]*)'/g)].map(m => m[1]);
    if (values.some(v => v.includes(','))) {
      // Bail on this list — a value contains the delimiter; emit it unchanged.
      return _m;
    }
    return `const ${name} = decodeStringList(${JSON.stringify(values.join(','))});`;
  });
  if (!hadMatch) return src;
  return `import { decodeStringList } from '../data/toonDecode.js';\n${rewritten}`;
}

const modules = new Map();
const order = [];

function loadModule(id) {
  if (modules.has(id)) return;
  modules.set(id, null);   // placeholder to break any cycles

  const fullPath = resolve(ROOT, id);
  let src = readFileSync(fullPath, 'utf8');

  // In artifact mode, stub out the dev test image to reduce bundle size.
  if (ARTIFACT_MODE && id === 'src/assets/devTestImage.js') {
    src = "export const DEV_TEST_IMAGE = '';";
  }

  // In artifact mode, swap fixed string-list assets to TOON-encoded form +
  // a runtime decoder, so the inline JS carries fewer per-item quotes.
  // Currently this only covers loadingPhrases.js — the careDb went away
  // entirely. Add new substitutions here as further large literals appear.
  if (ARTIFACT_MODE && id === 'src/assets/loadingPhrases.js') {
    src = toonifyStringLists(src);
  }

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
const mode = ARTIFACT_MODE ? ' [artifact mode]' : '';
console.log(`Built ${OUT_DIR}/${OUT_FILE}${mode}  (${(inlined.length / 1024).toFixed(0)} KB, ${order.length} modules)`);
