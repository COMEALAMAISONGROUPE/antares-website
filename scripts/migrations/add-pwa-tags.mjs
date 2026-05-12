#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/add-pwa-tags.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — adds the PWA-related <head> tags to every page that
   has a favicon link (so PWA install candidates are wired up
   consistently). For each page:

     1. <link rel="manifest" href="/manifest.json">  — declare PWA
     2. <meta name="theme-color" content="#00e5b0">   — match the
        brand mint on Android's address bar / iOS Safari status bar

   Inserts both lines on the line BELOW the existing favicon link.
   Idempotent: skips pages that already have either tag.

   Targets every public page (anything with the favicon link). Order
   doesn't matter — these are passive head metadata.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const FAVICON_LINK = '<link rel="icon" type="image/png" href="favicon.png">';
const MANIFEST_LINK = '<link rel="manifest" href="/manifest.json">';
const THEME_COLOR = '<meta name="theme-color" content="#00e5b0">';

let touched = 0, skipped = 0, errored = 0;

const entries = await readdir(cwd(), { withFileTypes: true });
const PAGES = entries
  .filter(e => e.isFile() && e.name.endsWith('.html'))
  .map(e => e.name)
  .sort();

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

  if (!src.includes(FAVICON_LINK)) {
    console.log(`-- ${file} (no favicon link, skipping)`);
    skipped++;
    continue;
  }

  const alreadyHas = src.includes(MANIFEST_LINK) || src.includes(THEME_COLOR);
  if (alreadyHas) {
    console.log(`-- ${file} (PWA tags already present)`);
    skipped++;
    continue;
  }

  const idx = src.indexOf(FAVICON_LINK);
  const after = src.slice(idx + FAVICON_LINK.length);
  const eol = after.startsWith('\r\n') ? '\r\n' : '\n';
  const insert = FAVICON_LINK + eol + MANIFEST_LINK + eol + THEME_COLOR;

  const next = src.replace(FAVICON_LINK, insert);
  await writeFile(path, next);
  console.log(`✓  ${file}`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
