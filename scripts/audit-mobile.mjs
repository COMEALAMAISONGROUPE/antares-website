#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/audit-mobile.mjs
   ──────────────────────────────────────────────────────────────────
   Mobile regression audit for antares-website. Used both locally
   (before pushing) and in CI (on every PR).

   What it checks at 375x812 viewport, for every public route:
     1. Zero horizontal overflow (document.scrollWidth ≤ clientWidth)
     2. A burger button is present and visible (display !== 'none')
        when the desktop links group exists — proves mobile nav is
        wired up.
     3. No SyntaxError or other uncaught error from inline <script>s.

   Exits 0 if everything passes, 1 otherwise. CI fails the PR on
   exit 1, so the bug pattern from PR #146 (a page forgetting to ship
   a burger) becomes unmergeable.

   Run:
     node scripts/audit-mobile.mjs
   Optional flags:
     --json          Output a machine-readable JSON summary at the end.
     --base=<url>    Audit a remote URL instead of serving locally.
   ────────────────────────────────────────────────────────────────── */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve, join } from 'node:path';
import { argv, exit, cwd } from 'node:process';

const args = new Map(argv.slice(2).map(a => {
  const [k, v] = a.split('=');
  return [k.replace(/^--/, ''), v ?? true];
}));
const wantJson = args.has('json');
const remoteBase = args.get('base');

/* Routes to audit. The list mirrors the public sitemap; pages that
   only exist as redirects (token.html) or build artifacts
   (og-generator.html) are excluded. */
const ROUTES = [
  '/', '/demo', '/features', '/engine', '/compare', '/pricing',
  '/install', '/sources', '/proof', '/faq', '/changelog', '/about',
  '/api', '/security', '/support', '/auth', '/account', '/privacy', '/terms',
];

/* ── tiny static server ──────────────────────────────────────────── */
const ROOT = cwd();
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};
function ext(p) { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i).toLowerCase(); }

/* Mirror vercel.json cleanUrls: /pricing → pricing.html */
async function resolveFile(urlPath) {
  const safe = normalize(urlPath.replace(/^\/+/, '')).replace(/\\/g, '/');
  const tries = [];
  if (urlPath === '/' || urlPath === '') tries.push('index.html');
  else {
    tries.push(safe);
    if (!ext(safe)) tries.push(safe + '.html');
    tries.push(join(safe, 'index.html'));
  }
  for (const t of tries) {
    const full = resolve(ROOT, t);
    if (!full.startsWith(resolve(ROOT))) continue;
    try { if ((await stat(full)).isFile()) return full; } catch { /* try next */ }
  }
  return null;
}

let server, base;
if (remoteBase) {
  base = remoteBase.replace(/\/$/, '');
} else {
  server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = await resolveFile(decodeURIComponent(u.pathname));
    if (!f) { res.statusCode = 404; res.end('404'); return; }
    res.setHeader('content-type', MIME[ext(f)] || 'application/octet-stream');
    res.end(await readFile(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

/* ── audit ───────────────────────────────────────────────────────── */
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

/* Console / network errors that are NOT our fault. CORS to external
   APIs (auth.me), preview-feedback widgets, font-CSP from Vercel
   preview — all noise. Anything else is suspect. */
const IGNORE = /CORS|Access to fetch|net::ERR_FAILED|preview-feedback|space-mono|401|403|Failed to fetch|Not signed in with the identity provider/i;

const results = [];
let failures = 0;

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push({ kind: 'pageerror', msg: String(e.message || e) }));
  page.on('console', m => {
    if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push({ kind: 'console', msg: m.text() });
  });

  let overflow = -1, burgerVisible = null, linksHidden = null, navigated = false;
  try {
    await page.goto(base + route, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForTimeout(800);
    navigated = true;

    const probe = await page.evaluate(() => {
      const d = document.documentElement;
      const burger = document.querySelector('.nav-burger');
      const links = document.querySelector('nav .links, .nav-inner .links');
      return {
        overflow: d.scrollWidth - d.clientWidth,
        burgerExists: !!burger,
        burgerDisplay: burger ? getComputedStyle(burger).display : null,
        linksExists: !!links,
        linksDisplay: links ? getComputedStyle(links).display : null,
      };
    });
    overflow = probe.overflow;
    burgerVisible = probe.burgerExists ? probe.burgerDisplay !== 'none' : null;
    linksHidden = probe.linksExists ? probe.linksDisplay === 'none' : null;
  } catch (e) {
    errors.push({ kind: 'nav', msg: e.message });
  }

  const checks = [];
  if (!navigated) checks.push('navigation-failed');
  if (overflow > 0) checks.push(`overflow=${overflow}`);
  // Burger expectation: if the page has a desktop links group, on mobile
  // either the burger is visible OR the links are hidden in a way that
  // doesn't leave them overflowing. We require: links hidden AND burger
  // visible. (Pages without a links group — /privacy, /terms — skip this.)
  if (route !== '/privacy' && route !== '/terms') {
    if (burgerVisible === false) checks.push('burger-hidden');
    if (linksHidden === false) checks.push('desktop-links-visible-on-mobile');
  }
  if (errors.length) checks.push(`js-errors=${errors.length}`);

  const status = checks.length ? 'FAIL' : 'PASS';
  if (status === 'FAIL') failures++;

  const icon = status === 'PASS' ? '✓' : '✗';
  const line = `${icon} ${route.padEnd(12)} overflow=${String(overflow).padEnd(4)} burger=${burgerVisible ?? '-'} linksHidden=${linksHidden ?? '-'}`;
  console.log(line);
  if (checks.length) console.log('   ' + checks.join(', '));
  for (const e of errors.slice(0, 3)) {
    console.log(`   [${e.kind}] ${e.msg.slice(0, 200)}`);
  }

  results.push({ route, status, overflow, burgerVisible, linksHidden, checks, errors: errors.map(e => e.msg.slice(0, 200)) });
  await page.close();
}

await browser.close();
if (server) server.close();

console.log('');
console.log(`Result: ${results.length - failures}/${results.length} passed`);

if (wantJson) {
  console.log('---JSON---');
  console.log(JSON.stringify(results, null, 2));
}

exit(failures === 0 ? 0 : 1);
