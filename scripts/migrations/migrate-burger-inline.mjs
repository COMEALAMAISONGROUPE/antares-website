#!/usr/bin/env node
/* One-shot — removes the inline burger menu (CSS block, drawer markup,
   toggle script) from the 15 pages patched by PR #146 and replaces it
   with the same <link>+<script> pair that /auth and /account use:

     <link rel="stylesheet" href="/css/mobile-fixes.css">
     <script src="/js/burger.js" defer></script>

   js/burger.js then injects the burger button + drawer at runtime
   based on each page's existing <nav> .links. Net: ~80 lines removed
   per page, 2 added — and one source of truth instead of fifteen.

   Three independent removals per file. Each is anchored on a unique
   marker so the regex can't run away into adjacent code:
     1. CSS block      :  /* ANTARES-BURGER-INJECT */  …  @media(min-width:821px){.mobile-menu{display:none}}
     2. Drawer markup  :  <button class="nav-burger"   …  </div>  (the next </div> after the mobile-menu)
     3. Toggle script  :  <script>...antares-burger-js  …  </script>

   The <link>+<script> pair is inserted before </head>. The script
   guarantees idempotency: it skips files that already reference
   /js/burger.js.

   Run:
     node scripts/migrate-burger-inline.mjs
   Then verify:
     node scripts/audit-mobile.mjs
*/

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const HEAD_INJECT =
  '<link rel="stylesheet" href="/css/mobile-fixes.css">\n' +
  '<script src="/js/burger.js" defer></script>\n';

const TARGETS = [
  'about.html', 'api.html', 'changelog.html', 'compare.html', 'demo.html',
  'engine.html', 'faq.html', 'features.html', 'index.html', 'install.html',
  'pricing.html', 'proof.html', 'security.html', 'sources.html', 'support.html',
];

let migrated = 0, skipped = 0;
for (const f of TARGETS) {
  const path = join(ROOT, f);
  const src = await readFile(path, 'utf8');

  if (src.includes('/js/burger.js')) {
    console.log(`-  ${f}: already references /js/burger.js (skipping)`);
    skipped++;
    continue;
  }

  let next = src;
  const removals = [];

  // 1. CSS block. Anchored on the comment that PR #146 inserted, and
  //    on the trailing media query that always closes the block.
  const cssRe = /\n?\/\* ANTARES-BURGER-INJECT \*\/\n[\s\S]*?@media\(min-width:821px\)\{\.mobile-menu\{display:none\}\}\n/;
  if (cssRe.test(next)) {
    next = next.replace(cssRe, '\n');
    removals.push('css');
  }

  // 2. Drawer markup. Two parts: the <button class="nav-burger">…</button>
  //    and the immediately-following <div class="mobile-menu" id="mobile-menu">…</div>.
  //    Both removed together via a single regex that spans them.
  const markupRe = /\s*<button class="nav-burger"[^>]*>[\s\S]*?<\/button>\s*<\/nav><\/header>\s*<div class="mobile-menu"[^>]*>[\s\S]*?<\/div>(?=<main|<\/div>|<div)/;
  if (markupRe.test(next)) {
    next = next.replace(markupRe, '\n      </nav></header>');
    removals.push('markup');
  } else {
    // Some pages have plain <nav> (no <header> wrapper). Try that variant.
    const markupRe2 = /\s*<button class="nav-burger"[^>]*>[\s\S]*?<\/button>\s*<\/nav>\s*<div class="mobile-menu"[^>]*>[\s\S]*?<\/div>(?=<main|<\/div>|<div)/;
    if (markupRe2.test(next)) {
      next = next.replace(markupRe2, '</nav>');
      removals.push('markup-plain-nav');
    }
  }

  // 3. Toggle script. Anchored on the unique "antares-burger-js" marker.
  const jsRe = /\n?<script>\s*\/\* antares-burger-js \*\/\s*\(function\(\)\{[\s\S]*?\}\)\(\);\s*<\/script>\n?/;
  if (jsRe.test(next)) {
    next = next.replace(jsRe, '\n');
    removals.push('js');
  }

  // 4. Insert <link>+<script> before </head>. Skip if already present
  //    (idempotency check above caught the common case; this guards
  //    against a future re-run after a partial migration).
  if (!next.includes('/css/mobile-fixes.css')) {
    next = next.replace(/<\/head>/, HEAD_INJECT + '</head>');
    removals.push('head-injected');
  } else {
    // Already has mobile-fixes.css link (unusual), just add burger.js.
    if (!next.includes('/js/burger.js')) {
      next = next.replace(/<\/head>/, '<script src="/js/burger.js" defer></script>\n</head>');
      removals.push('burger.js-only-injected');
    }
  }

  if (next === src) {
    console.log(`!  ${f}: nothing changed (no removals matched)`);
    continue;
  }

  await writeFile(path, next);
  console.log(`✓  ${f}: removed ${removals.join(', ')}`);
  migrated++;
}

console.log(`\nMigrated ${migrated} / Skipped ${skipped} / Total ${TARGETS.length}`);
