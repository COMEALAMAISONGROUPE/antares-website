#!/usr/bin/env node
/* One-shot — replaces the inline particles+glow+reveals IIFE on the
   3 pages that ship it with a <script src> reference to
   /js/hero-effects.js. Idempotent; skips already-migrated pages.

   The IIFE is anchored on two unique substrings:
     "particles-canvas" inside the body, AND ";(function(){" at the
   start of the <script>. We verified up-front (md5sum) that the IIFE
   is byte-identical on engine, features, sources.

   Run:
     node scripts/migrate-hero-effects.mjs
*/

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const TARGETS = ['engine.html', 'features.html', 'sources.html'];
const REPLACEMENT = '<script src="/js/hero-effects.js" defer></script>';

let migrated = 0, skipped = 0;
for (const f of TARGETS) {
  const path = join(ROOT, f);
  const src = await readFile(path, 'utf8');

  if (src.includes('/js/hero-effects.js')) {
    console.log(`-  ${f}: already references /js/hero-effects.js (skipping)`);
    skipped++;
    continue;
  }

  // Match <script>;(function(){...particles-canvas...})()</script>
  // The body is non-greedy and anchored on the unique 'particles-canvas'
  // substring so we don't accidentally swallow a neighbouring script.
  const re = /<script>\s*;\(function\(\)\{[\s\S]*?particles-canvas[\s\S]*?\}\)\(\)\s*<\/script>/;
  if (!re.test(src)) {
    console.log(`!  ${f}: no inline hero-effects script matched`);
    continue;
  }
  const next = src.replace(re, REPLACEMENT);
  if (next === src) { console.log(`!  ${f}: regex matched but produced no change`); continue; }
  await writeFile(path, next);
  console.log(`✓  ${f}: replaced inline hero-effects script`);
  migrated++;
}

console.log(`\nMigrated ${migrated} / Skipped ${skipped} / Total ${TARGETS.length}`);
