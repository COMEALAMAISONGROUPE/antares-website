#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/add-a11y-script.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — adds <script src="/js/a11y.js" defer></script> to every
   public page that has a <main> element (so the skip-link injector
   has somewhere to skip to). Inserts the line right after the
   /css/mobile-fixes.css <link>, mirroring the pattern used by
   /js/burger.js and /js/mobile-cta-rewrite.js.

   Idempotent: re-runs no-op pages where the script tag is already
   present.

   Targets the 19 audit routes (everything except token + 404 +
   og-generator). The audit verifies all 19 are still PASS after
   the change.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const PAGES = [
  'about.html', 'account.html', 'api.html', 'auth.html',
  'changelog.html', 'compare.html', 'demo.html', 'engine.html',
  'faq.html', 'features.html', 'index.html', 'install.html',
  'pricing.html', 'privacy.html', 'proof.html', 'security.html',
  'sources.html', 'support.html', 'terms.html',
];

const A11Y_TAG = '<script src="/js/a11y.js" defer></script>';
// Insert position: right after the mobile-fixes.css link. That spot
// exists on every audit page and keeps a11y.js loaded before any
// other JS that might depend on <main> being focusable.
const ANCHOR = '<link rel="stylesheet" href="/css/mobile-fixes.css">';

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

  if (src.includes(A11Y_TAG)) {
    console.log(`-- ${file} (already has a11y.js)`);
    skipped++;
    continue;
  }

  if (!src.includes(ANCHOR)) {
    console.error(`SKIP ${file}: anchor (mobile-fixes.css link) not found`);
    errored++;
    continue;
  }

  // Detect EOL of the file at the anchor line.
  const idx = src.indexOf(ANCHOR);
  const after = src.slice(idx + ANCHOR.length);
  const eol = after.startsWith('\r\n') ? '\r\n' : '\n';

  const next = src.replace(
    ANCHOR,
    ANCHOR + eol + A11Y_TAG
  );

  await writeFile(path, next);
  console.log(`✓  ${file}`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
