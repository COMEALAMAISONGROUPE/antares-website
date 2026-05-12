#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/regenerate-sitemap.mjs
   ──────────────────────────────────────────────────────────────────
   Regenerates sitemap.xml from the actual git history of each
   page's *.html file. Run this whenever you ship a substantive
   content change so search engines see an honest `<lastmod>`.

   Usage:
     node scripts/regenerate-sitemap.mjs

   Output:
     Overwrites sitemap.xml at the repo root.

   What's listed:
     Every public route in the same order/priority the previous
     hand-curated sitemap used, plus /security which had been
     forgotten.
   ────────────────────────────────────────────────────────────────── */
import { execSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const SITE = 'https://antaresscan.com';

/* [route, html-file, priority] — order is sitemap order. */
const ROUTES = [
  ['/',          'index.html',     '1.0'],
  ['/features',  'features.html',  '0.9'],
  ['/demo',      'demo.html',      '0.9'],
  ['/compare',   'compare.html',   '0.9'],
  ['/pricing',   'pricing.html',   '0.9'],
  ['/install',   'install.html',   '0.8'],
  ['/engine',    'engine.html',    '0.8'],
  ['/proof',     'proof.html',     '0.8'],
  ['/sources',   'sources.html',   '0.7'],
  ['/faq',       'faq.html',       '0.7'],
  ['/changelog', 'changelog.html', '0.6'],
  ['/support',   'support.html',   '0.6'],
  ['/about',     'about.html',     '0.5'],
  ['/api',       'api.html',       '0.5'],
  ['/security',  'security.html',  '0.5'],
  ['/privacy',   'privacy.html',   '0.4'],
  ['/terms',     'terms.html',     '0.4'],
];

function lastModFor(file) {
  try {
    const out = execSync(`git log -1 --format=%cs -- "${file}"`, {
      cwd: cwd(), encoding: 'utf8',
    }).trim();
    if (out) return out;
  } catch { /* fall through */ }
  // Fallback: today's date in YYYY-MM-DD.
  return new Date().toISOString().slice(0, 10);
}

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
];

for (const [route, file, priority] of ROUTES) {
  const mod = lastModFor(file);
  lines.push(
    `  <url><loc>${SITE}${route}</loc><lastmod>${mod}</lastmod><priority>${priority}</priority></url>`
  );
}

lines.push('</urlset>', '');

const out = lines.join('\n');
await writeFile(join(cwd(), 'sitemap.xml'), out);
console.log(`Wrote sitemap.xml with ${ROUTES.length} routes.`);
exit(0);
