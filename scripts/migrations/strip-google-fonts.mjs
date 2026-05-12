#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/strip-google-fonts.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — removes every Google-Fonts <link> from every HTML page
   in the repo root. We now self-host the same fonts (Bebas Neue 400
   + IBM Plex Mono 400/600/700) via css/base.css, so the
   render-blocking Google CSS request and the two preconnects are
   dead weight.

   What it strips per file:
     - <link href="https://fonts.googleapis.com/css2?…" rel="stylesheet">
     - <link rel="preconnect" href="https://fonts.googleapis.com">
     - <link rel="preconnect" href="https://fonts.gstatic.com" …>

   Plus the trailing newline of each removed line so we don't leave
   empty rows.

   Idempotent. CRLF-aware.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

// Match a <link> tag that references fonts.googleapis.com or
// fonts.gstatic.com, plus its surrounding whitespace and trailing
// newline. The `[^\n]*?` non-greedy run before `<link` swallows
// indentation; the optional trailing `\r?\n` removes the whole line.
const FONTS_LINK_LINE = /[^\S\n]*<link\b[^>]*?(?:fonts\.googleapis\.com|fonts\.gstatic\.com)[^>]*>\s*(?:\r?\n)?/g;

const entries = await readdir(cwd(), { withFileTypes: true });
const PAGES = entries
  .filter(e => e.isFile() && e.name.endsWith('.html'))
  .map(e => e.name)
  .sort();

let touched = 0, skipped = 0, errored = 0;

for (const file of PAGES) {
  const path = join(cwd(), file);
  let src;
  try {
    src = await readFile(path, 'utf8');
  } catch (e) {
    console.error(`SKIP ${file}: ${e.message}`);
    errored++;
    continue;
  }

  if (!FONTS_LINK_LINE.test(src)) {
    console.log(`-- ${file} (no Google Fonts link)`);
    skipped++;
    continue;
  }
  FONTS_LINK_LINE.lastIndex = 0;

  const next = src.replace(FONTS_LINK_LINE, '');
  if (next === src) {
    console.log(`-- ${file} (no-op replace)`);
    skipped++;
    continue;
  }

  await writeFile(path, next);
  const removed = (src.match(FONTS_LINK_LINE) || []).length;
  console.log(`✓  ${file} (removed ${removed} line${removed === 1 ? '' : 's'})`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
