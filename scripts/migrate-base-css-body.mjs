#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/migrate-base-css-body.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — strips the universal body rule from the 17 pages that
   declare it inline byte-identically:

     body{background:var(--bg);color:var(--txt);font-family:'IBM Plex Mono',monospace;overflow-x:hidden}

   The same rule now lives in css/base.css (loaded via <link> by
   PR #184 on every targeted page). Removing it inline trims 17 more
   redundant lines and leaves a single source of truth.

   Excluded: account.html. It has a DIFFERENT body rule
     body{…;min-height:100vh;display:flex;flex-direction:column}
   so we leave its inline body alone; base.css's body sets
   overflow-x:hidden which is a harmless no-op there (audit verifies
   account has zero horizontal overflow at all viewports).

   Idempotent. Handles CRLF/LF line endings.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const PAGES = [
  'about.html', 'api.html', 'changelog.html', 'compare.html',
  'demo.html', 'engine.html', 'faq.html', 'features.html',
  'index.html', 'install.html', 'pricing.html', 'privacy.html',
  'proof.html', 'security.html', 'sources.html', 'support.html',
  'terms.html',
];

const RULE = "body{background:var(--bg);color:var(--txt);font-family:'IBM Plex Mono',monospace;overflow-x:hidden}\n";

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

  let next = src;
  let changed = false;
  for (const eol of ['\r\n', '\n']) {
    const variant = RULE.replace(/\n$/, eol);
    if (next.includes(variant)) {
      next = next.replace(variant, '');
      changed = true;
      break;
    }
  }

  if (!changed) {
    console.log(`-- ${file} (already migrated)`);
    skipped++;
    continue;
  }

  await writeFile(path, next);
  console.log(`✓  ${file}`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
