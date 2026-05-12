#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/add-breadcrumb-jsonld.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — adds a Schema.org BreadcrumbList JSON-LD block to
   every non-home audit route. Lets Google render breadcrumbs in
   search results (e.g. antaresscan.com › Pricing › Pro tier).

   Page name comes from the <title> tag, stripping the "— Antares"
   suffix. Inserts just before </head> as a new
   <script type="application/ld+json">.

   Idempotent: skips pages that already have a BreadcrumbList block.

   Targets 18 routes (all 19 except home).
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const SITE = 'https://antaresscan.com';

const ROUTES = [
  ['/demo',      'demo.html'],
  ['/features',  'features.html'],
  ['/engine',    'engine.html'],
  ['/compare',   'compare.html'],
  ['/pricing',   'pricing.html'],
  ['/install',   'install.html'],
  ['/sources',   'sources.html'],
  ['/proof',     'proof.html'],
  ['/faq',       'faq.html'],
  ['/changelog', 'changelog.html'],
  ['/about',     'about.html'],
  ['/api',       'api.html'],
  ['/security',  'security.html'],
  ['/support',   'support.html'],
  ['/auth',      'auth.html'],
  ['/account',   'account.html'],
  ['/privacy',   'privacy.html'],
  ['/terms',     'terms.html'],
];

let touched = 0, skipped = 0, errored = 0;

for (const [route, file] of ROUTES) {
  const path = join(cwd(), file);
  let src;
  try {
    src = await readFile(path, 'utf8');
  } catch (e) {
    console.error(`SKIP ${file}: ${e.message}`);
    errored++;
    continue;
  }

  if (/BreadcrumbList/.test(src)) {
    console.log(`-- ${file} (already has BreadcrumbList)`);
    skipped++;
    continue;
  }

  // Pull the page name out of <title>...</title>. We accept any of
  // these "— Antares" / "- Antares" / "— Antares - Foo" patterns and
  // grab the leading segment.
  const titleMatch = src.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) {
    console.error(`SKIP ${file}: no <title> found`);
    errored++;
    continue;
  }
  // Decode the common HTML entities our titles use, then strip
  // "Antares" + surrounding dash from either end. Titles in this
  // codebase use both directions: "Pricing — Antares" and
  // "Antares — Live Demo". We want just the page-specific bit.
  const decoded = titleMatch[1]
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
  let pageName = decoded
    .replace(/^\s*Antares\s*[—–-]\s*/, '')   // strip "Antares — " prefix
    .replace(/\s*[—–-]\s*Antares\s*$/, '')   // strip " — Antares" suffix
    .trim();
  if (!pageName) pageName = decoded;

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: pageName, item: `${SITE}${route}` },
    ],
  });

  const tag = `<script type="application/ld+json">${jsonLd}</script>`;

  // Insert before </head>. Preserve the EOL of the surrounding line.
  const headClose = src.indexOf('</head>');
  if (headClose < 0) {
    console.error(`SKIP ${file}: no </head> found`);
    errored++;
    continue;
  }
  const before = src.slice(0, headClose);
  const after = src.slice(headClose);
  const eol = before.endsWith('\r\n') ? '\r\n' : '\n';
  const next = before + tag + eol + after;

  await writeFile(path, next);
  console.log(`✓  ${file} (page name: "${pageName}")`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
