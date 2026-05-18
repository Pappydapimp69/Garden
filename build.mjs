#!/usr/bin/env node
// Zero-dependency bundler. Reads index.html + every ES module under src/,
// produces a single self-contained dist/garden.html that runs by double-click
// or by hosting from anywhere static.
//
// Usage:  node build.mjs [--artifact]
//   --artifact: Strip embedded dev image, minify JS+CSS for Claude.ai artifact paste.
//               Output: dist/garden-artifact.html
//
// Minification: uses terser if installed (npm install). Falls back gracefully
// to unminified output if terser is not available.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const ARTIFACT_MODE = process.argv.includes('--artifact');
const ENTRY    = 'src/main.js';
const HTML_IN  = 'index.html';
const CSS_IN   = 'styles/main.css';
const OUT_DIR  = 'dist';
const OUT_FILE = ARTIFACT_MODE ? 'garden-artifact.html' : 'garden.html';

const IMPORT_RE      = /^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]\s*;?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(const|let|function|async\s+function)\s+([A-Za-z_$][\w$]*)/gm;

const modules = new Map();
const order   = [];

function loadModule(id) {
  if (modules.has(id)) return;
  modules.set(id, null);

  const fullPath = resolve(ROOT, id);
  let src = readFileSync(fullPath, 'utf8');

  if (ARTIFACT_MODE && id === 'src/assets/devTestImage.js') {
    src = "export const DEV_TEST_IMAGE = '';";
  }
  if (ARTIFACT_MODE && id === 'src/config.js') {
    src = src.replace(
      'export const ARTIFACT_MODE     = false;',
      'export const ARTIFACT_MODE     = true;',
    );
  }

  const deps = [];
  let body = src.replace(IMPORT_RE, (_m, names, importPath) => {
    const absId = relative(ROOT, resolve(dirname(fullPath), importPath));
    const parsed = names.split(',').map(s => s.trim()).filter(Boolean).map(s => {
      const [orig, alias] = s.split(/\s+as\s+/).map(t => t.trim());
      return { orig, alias: alias || orig };
    });
    deps.push({ id: absId, names: parsed });
    return '';
  });

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

// ── Emit bundle ──────────────────────────────────────────────────────────────
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

  return `// ── ${id} ──\n{\n  __mods[${JSON.stringify(id)}] = {};\n${importLines}\n${body}\n${exportLines}\n}`;
}).join('\n\n');

let bundle = `(()=>{\n'use strict';\nconst __mods={};\n${blocks}\n})();\n`;

// ── Minify (artifact mode only, requires terser) ──────────────────────────────
if (ARTIFACT_MODE) {
  try {
    const { minify } = await import('terser');
    const result = await minify(bundle, {
      compress: { passes: 2, drop_console: false },
      mangle: true,
      format: { comments: false },
    });
    if (result.code) {
      const before = bundle.length;
      bundle = result.code;
      console.log(`Minified JS: ${(before/1024).toFixed(0)} KB → ${(bundle.length/1024).toFixed(0)} KB`);
    }
  } catch (e) {
    console.log('terser not available, skipping JS minification (run npm install to enable)');
  }
}

// ── Minify CSS ───────────────────────────────────────────────────────────────
function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')           // remove comments
    .replace(/\s+/g, ' ')                        // collapse whitespace
    .replace(/\s*([{};:,>~+!])\s*/g, '$1')      // remove spaces around punctuation
    .replace(/;}/g, '}')                         // remove trailing semicolons
    .trim();
}

// ── Inline into HTML ─────────────────────────────────────────────────────────
const html = readFileSync(resolve(ROOT, HTML_IN), 'utf8');
const css  = readFileSync(resolve(ROOT, CSS_IN),  'utf8');
const finalCSS = ARTIFACT_MODE ? minifyCSS(css) : css;
const finalHTML = ARTIFACT_MODE
  ? html.replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\n/gm, '')
  : html;

const inlined = finalHTML
  .replace(
    /<link\s+rel="stylesheet"\s+href="\.\/styles\/main\.css"\s*>/,
    `<style>${finalCSS}</style>`,
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
