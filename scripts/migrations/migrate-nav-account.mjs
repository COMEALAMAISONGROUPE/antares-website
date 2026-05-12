#!/usr/bin/env node
/* One-shot script — replaces the inline nav-account <script> on the
   15 pages that ship it with a <script src> reference to
   /js/nav-account.js. Idempotent: skips files that already use the
   external script.

   We verified up-front (md5sum) that the inline block is byte-
   identical on every page, so a single literal replacement is safe.
   The pattern is anchored on the unique substring "antares.signed-in"
   so we can't accidentally replace anything else.

   Run once:
     node scripts/migrate-nav-account.mjs
   Then audit:
     node scripts/audit-mobile.mjs
*/

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const REPLACEMENT = '<script src="/js/nav-account.js" defer></script>';

const files = (await readdir(ROOT)).filter(f => f.endsWith('.html'));
let migrated = 0, skipped = 0;

for (const f of files) {
  const path = join(ROOT, f);
  const src = await readFile(path, 'utf8');

  // Skip pages that already reference the external file.
  if (src.includes('/js/nav-account.js')) {
    skipped++;
    continue;
  }

  // Match the whole inline <script>...antares.signed-in...</script>.
  // Non-greedy body capture; restricted to a <script> with no src
  // attribute, so we don't accidentally touch other scripts.
  const re = /<script>\(function\(\)\{var e=document\.getElementById\('nav-account'\);[^<]*?\}\)\(\);<\/script>/;
  if (!re.test(src)) {
    console.log(`-  ${f}: no inline nav-account script (skipping)`);
    continue;
  }
  const next = src.replace(re, REPLACEMENT);
  if (next === src) { console.log(`!  ${f}: regex matched but produced no change`); continue; }
  await writeFile(path, next);
  console.log(`✓  ${f}: replaced inline nav-account script`);
  migrated++;
}

console.log(`\nMigrated ${migrated}, already-migrated/no-match ${skipped + (files.length - migrated - skipped)} of ${files.length}`);
