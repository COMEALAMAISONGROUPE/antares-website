#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/migrate-base-css.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — pulls the 4 universal CSS rules out of each page's
   inline <style> block and points the page at css/base.css instead.

     1. *{margin:0;padding:0;box-sizing:border-box}
     2. html{scroll-behavior:smooth;scrollbar-gutter:stable}
     3. .stripe{position:fixed;…animation:stripe 6s linear infinite;opacity:.7}
     4. @keyframes stripe{0%{background-position:0% 0}100%{background-position:400% 0}}

   Runs on the 18 pages where all 4 rules currently appear
   byte-identically. Pages excluded:
     auth.html, token.html, 404.html, og-generator.html — they don't
     have the full set, so we leave their inline rules untouched.

   What it does to each target page:
     - inserts `<link rel="stylesheet" href="/css/base.css">` on the
       line ABOVE the first <style> tag (so the file order is
       base.css → inline <style> → mobile-fixes.css, which preserves
       cascade correctness)
     - removes the 4 inline rules

   Idempotent: if base.css link is already present OR the inline
   rules are already gone, the script no-ops that page.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const PAGES = [
  'about.html', 'api.html', 'changelog.html', 'compare.html',
  'demo.html', 'engine.html', 'faq.html', 'features.html',
  'index.html', 'install.html', 'pricing.html', 'proof.html',
  'security.html', 'sources.html', 'support.html',
  'terms.html', 'privacy.html', 'account.html',
];

const RULES = [
  '*{margin:0;padding:0;box-sizing:border-box}\n',
  'html{scroll-behavior:smooth;scrollbar-gutter:stable}\n',
  '.stripe{position:fixed;top:0;left:0;right:0;height:3px;z-index:999;background:linear-gradient(90deg,#c0007a,var(--c),#c8c000,#c0002a,var(--c),#c0007a);background-size:400% 100%;animation:stripe 6s linear infinite;opacity:.7}\n',
  '@keyframes stripe{0%{background-position:0% 0}100%{background-position:400% 0}}\n',
];

const LINK_TAG = '<link rel="stylesheet" href="/css/base.css">';

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

  // 1. Add the <link> tag before the first <style> if not already present.
  if (!next.includes(LINK_TAG)) {
    const m = next.match(/^(.*?)(<style>)/s);
    if (!m) {
      console.error(`SKIP ${file}: no <style> tag found`);
      errored++;
      continue;
    }
    // Insert the link on its own line right before <style>.
    next = next.replace(/^(.*?)(<style>)/s, `$1${LINK_TAG}\n$2`);
    changed = true;
  }

  // 2. Strip each of the 4 rules. Files may have mixed CRLF/LF line
  //    endings (Windows-edited HTML, Unix-written scripts), so try
  //    both terminators for each rule.
  for (const rule of RULES) {
    for (const eol of ['\r\n', '\n']) {
      const variant = rule.replace(/\n$/, eol);
      if (next.includes(variant)) {
        next = next.replace(variant, '');
        changed = true;
        break;
      }
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
