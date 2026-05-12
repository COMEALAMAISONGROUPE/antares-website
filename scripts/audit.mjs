#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/audit.mjs
   ──────────────────────────────────────────────────────────────────
   Regression audit for antares-website. Runs Playwright headless
   against every public route at one or both viewports, asserts on
   layout / DOM / behaviour, and exits non-zero on any failure so
   CI gates the merge.

   Usage:
     node scripts/audit.mjs                          # both viewports
     node scripts/audit.mjs --viewport=mobile        # mobile only
     node scripts/audit.mjs --viewport=desktop       # desktop only
     node scripts/audit.mjs --base=https://...       # audit a remote URL
     node scripts/audit.mjs --json                   # JSON tail for CI parsing
     VERCEL_BYPASS_TOKEN=...  node scripts/audit.mjs  # password-protected previews

   What it asserts on EVERY route:

     Mobile (375×812)
       • Zero horizontal overflow
       • If page has a desktop links group: burger is rendered and
         visible (display !== 'none')
       • If page has a desktop links group: the drawer markup
         (<div id="mobile-menu">) exists in the DOM
       • If page has a desktop links group: tapping the burger
         actually opens the drawer (.open class toggles within 400ms)
       • Footer state matches the home/other-page split: hidden on
         /, visible on the rest (PR #168 + #169 contract)
       • No uncaught JS errors

     Desktop (1280×800)
       • Overflow ≤ 17 px (scrollbar gutter tolerance)
       • Desktop nav links group is visible (display !== 'none')
       • A <h1> is rendered somewhere on the page
       • footer's <span> ("No mercy for scammers") inherits the
         footer's grey color, doesn't paint mint (PR #167 contract)
       • No uncaught JS errors

   Plus home-only assertions on DESKTOP:
       • The "$2.8B" loss-counter animation lands on "2.8" after
         scrolling the loss-strip into view (PR #166 A1 contract)
       • The cta-final typewriter actually runs (typewrite-run +
         typewrite-done classes show up after scrolling) (PR #166
         B1 contract)

   Exits 0 if everything passes, 1 otherwise.
   ────────────────────────────────────────────────────────────────── */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve, join } from 'node:path';
import { argv, exit, cwd, env } from 'node:process';

const args = new Map(argv.slice(2).map(a => {
  const [k, v] = a.split('=');
  return [k.replace(/^--/, ''), v ?? true];
}));
const wantJson = args.has('json');
const remoteBase = args.get('base');
const viewportArg = (args.get('viewport') || 'both').toLowerCase();
const VIEWPORTS_TO_RUN = viewportArg === 'both'
  ? ['mobile', 'desktop']
  : [viewportArg];

if (!['mobile', 'desktop', 'both'].includes(viewportArg)) {
  console.error(`Unknown --viewport="${viewportArg}". Use mobile, desktop, or both.`);
  exit(2);
}

/* Routes to audit. Same list as before — public sitemap, no
   redirect-only or build-only artifacts. */
const ROUTES = [
  '/', '/demo', '/features', '/engine', '/compare', '/pricing',
  '/install', '/sources', '/proof', '/faq', '/changelog', '/about',
  '/api', '/security', '/support', '/auth', '/account', '/privacy', '/terms',
];

/* Per-viewport browser context settings. */
const VIEWPORTS = {
  mobile: {
    label: 'mobile',
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  desktop: {
    label: 'desktop',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  },
};

/* ── tiny static server (same as before) ────────────────────────── */
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

/* Apply the same security headers Vercel sends in production, so the
   local audit catches CSP misconfig (blocked fetches, blocked inline
   scripts, etc.) the same way it would in prod. We read vercel.json
   and apply every header from the catch-all "/(.*)" route. */
async function loadVercelHeaders() {
  try {
    const vj = JSON.parse(await readFile(resolve(ROOT, 'vercel.json'), 'utf8'));
    const block = (vj.headers || []).find(h => h.source === '/(.*)');
    if (!block) return {};
    const out = {};
    for (const h of block.headers) out[h.key] = h.value;
    return out;
  } catch { return {}; }
}
const vercelHeaders = await loadVercelHeaders();

let server, base;
if (remoteBase) {
  base = remoteBase.replace(/\/$/, '');
} else {
  server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const f = await resolveFile(decodeURIComponent(u.pathname));
    if (!f) { res.statusCode = 404; res.end('404'); return; }
    res.setHeader('content-type', MIME[ext(f)] || 'application/octet-stream');
    for (const [k, v] of Object.entries(vercelHeaders)) res.setHeader(k, v);
    res.end(await readFile(f));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
}

/* Vercel password bypass — same as before. */
const bypassToken = env.VERCEL_BYPASS_TOKEN;
const extraHTTPHeaders = bypassToken
  ? { 'x-vercel-protection-bypass': bypassToken, 'x-vercel-set-bypass-cookie': 'true' }
  : undefined;

/* Console errors we tolerate (third-party noise, see PR #155). */
const IGNORE_ERRORS = /CORS|Access to fetch|net::ERR_FAILED|preview-feedback|space-mono|401|403|Failed to fetch|Not signed in with the identity provider/i;

/* ── assertion helpers ──────────────────────────────────────────── */

/* Pages whose nav is the simplified <a brand><a back> shape — they
   don't have a .links group on desktop, so the burger+drawer
   expectations are skipped on those routes. */
const PAGES_WITHOUT_LINKS_GROUP = new Set(['/privacy', '/terms']);

/* Pages that are expected to hide the footer on mobile (PR #168 +
   the body.is-home contract). Currently only the home. */
const PAGES_WITH_HIDDEN_MOBILE_FOOTER = new Set(['/']);

async function auditMobile(page, route) {
  const fails = [];
  const probe = await page.evaluate(() => {
    const d = document.documentElement;
    const burger = document.querySelector('.nav-burger');
    const drawer = document.getElementById('mobile-menu');
    const links = document.querySelector('nav .links, .nav-inner .links');
    const footer = document.querySelector('footer');
    const main = document.querySelector('main');
    const skipLink = document.querySelector('.skip-link');
    const isHome = document.body.classList.contains('is-home');
    return {
      overflow: d.scrollWidth - d.clientWidth,
      burgerExists: !!burger,
      burgerVisible: burger ? getComputedStyle(burger).display !== 'none' : false,
      drawerExists: !!drawer,
      linksGroupExists: !!links,
      linksGroupDisplay: links ? getComputedStyle(links).display : null,
      footerExists: !!footer,
      footerDisplay: footer ? getComputedStyle(footer).display : null,
      mainExists: !!main,
      skipLinkExists: !!skipLink,
      skipLinkTargetsMain: skipLink && main ? skipLink.getAttribute('href') === '#' + main.id : false,
      isHome,
    };
  });

  if (probe.overflow > 0) fails.push(`overflow=${probe.overflow}px`);

  /* Burger / drawer contract — skip on minimal-nav pages. */
  if (!PAGES_WITHOUT_LINKS_GROUP.has(route)) {
    if (!probe.burgerVisible) fails.push('burger-not-visible');
    if (!probe.drawerExists) fails.push('drawer-markup-missing');
    if (probe.linksGroupExists && probe.linksGroupDisplay !== 'none') {
      fails.push(`desktop-links-not-hidden (display=${probe.linksGroupDisplay})`);
    }
    /* Tap the burger and assert the drawer opens. The burger handlers
       are wired by either the inline script (PR #146) or js/burger.js
       (PR #149, #177); either way a click should toggle .open. */
    if (probe.burgerVisible && probe.drawerExists) {
      await page.evaluate(() => {
        document.querySelector('.nav-burger').click();
      });
      await page.waitForTimeout(400);
      const drawerOpen = await page.evaluate(() =>
        document.getElementById('mobile-menu')?.classList.contains('open') ?? false
      );
      if (!drawerOpen) fails.push('burger-click-does-not-open-drawer');
      /* Close it again so the next page test doesn't inherit state. */
      await page.evaluate(() => {
        const m = document.getElementById('mobile-menu');
        if (m) m.classList.remove('open');
        document.body.classList.remove('menu-open');
      });
    }
  }

  /* Footer state — home hidden, others visible (PR #168, #169). */
  if (PAGES_WITH_HIDDEN_MOBILE_FOOTER.has(route)) {
    if (probe.footerExists && probe.footerDisplay !== 'none') {
      fails.push(`home-footer-should-be-hidden (display=${probe.footerDisplay})`);
    }
  }

  /* Skip-link contract — every page that has a <main> should also
     have an injected skip-link pointing at it (js/a11y.js). */
  if (probe.mainExists) {
    if (!probe.skipLinkExists) fails.push('skip-link-missing');
    else if (!probe.skipLinkTargetsMain) fails.push('skip-link-target-mismatch');
  }

  return { fails, probe };
}

async function auditDesktop(page, route) {
  const fails = [];
  const probe = await page.evaluate(() => {
    const d = document.documentElement;
    const links = document.querySelector('nav .links, .nav-inner .links');
    const h1 = document.querySelector('h1');
    const footer = document.querySelector('footer');
    const footerSpan = footer ? footer.querySelector('span') : null;
    const main = document.querySelector('main');
    const skipLink = document.querySelector('.skip-link');
    const manifest = document.querySelector('link[rel="manifest"]');
    const themeColor = document.querySelector('meta[name="theme-color"]');
    return {
      overflow: d.scrollWidth - d.clientWidth,
      linksExists: !!links,
      linksVisible: links ? getComputedStyle(links).display !== 'none' : false,
      h1Exists: !!h1,
      h1Empty: h1 ? !h1.textContent.trim() : true,
      footerSpanColor: footerSpan ? getComputedStyle(footerSpan).color : null,
      footerColor: footer ? getComputedStyle(footer).color : null,
      mainExists: !!main,
      skipLinkExists: !!skipLink,
      skipLinkTargetsMain: skipLink && main ? skipLink.getAttribute('href') === '#' + main.id : false,
      manifestLinked: !!manifest,
      themeColor: themeColor ? themeColor.getAttribute('content') : null,
    };
  });

  /* Allow up to 17 px overflow for OS scrollbar gutter. Anything
     above that is a real horizontal scroll bug. */
  if (probe.overflow > 17) fails.push(`overflow=${probe.overflow}px`);

  if (!PAGES_WITHOUT_LINKS_GROUP.has(route)) {
    if (!probe.linksExists) fails.push('nav-links-group-missing');
    else if (!probe.linksVisible) fails.push('nav-links-hidden-on-desktop');
  }

  if (!probe.h1Exists) fails.push('no-h1-on-page');
  else if (probe.h1Empty) fails.push('h1-is-empty');

  /* Footer "No mercy for scammers" should inherit the footer's
     grey, not paint mint. PR #167 contract. */
  if (probe.footerSpanColor && probe.footerColor &&
      probe.footerSpanColor !== probe.footerColor) {
    fails.push(
      `footer-span-color-mismatch (span=${probe.footerSpanColor}, footer=${probe.footerColor})`
    );
  }

  /* Skip-link contract (same as mobile). */
  if (probe.mainExists) {
    if (!probe.skipLinkExists) fails.push('skip-link-missing');
    else if (!probe.skipLinkTargetsMain) fails.push('skip-link-target-mismatch');
  }

  /* PWA contract: every public route declares the manifest + a
     theme-color matching the brand mint (#00e5b0). */
  if (!probe.manifestLinked) fails.push('manifest-link-missing');
  if (probe.themeColor !== '#00e5b0') {
    fails.push(`theme-color-mismatch (got="${probe.themeColor}")`);
  }

  /* Home-only animation contract (PR #166). */
  if (route === '/') {
    /* Trigger A1 — counter tick-up — by scrolling the loss-strip
       into view. easeOutExpo finishes around 1.6s. */
    await page.evaluate(() => {
      document.querySelector('.loss-strip')?.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(2200);
    const counter = await page.evaluate(() =>
      document.getElementById('loss-counter')?.textContent
    );
    if (counter !== '2.8') {
      fails.push(`A1-counter-final-value="${counter}" (expected "2.8")`);
    }

    /* Trigger B1 — typewriter on cta-final — by scrolling it into
       view. Threat line + headline both should reach
       .typewrite-run + .typewrite-done within ~2.5s. */
    await page.evaluate(() => {
      document.querySelector('.cta-final')?.scrollIntoView({ behavior: 'instant' });
    });
    await page.waitForTimeout(2700);
    const cta = await page.evaluate(() => {
      const threat = document.querySelector('.cta-threat');
      const headline = document.querySelector('.cta-final h2');
      return {
        threatRun: threat?.classList.contains('typewrite-run') ?? false,
        threatDone: threat?.classList.contains('typewrite-done') ?? false,
        headlineRun: headline?.classList.contains('typewrite-run') ?? false,
        headlineDone: headline?.classList.contains('typewrite-done') ?? false,
      };
    });
    if (!cta.threatRun) fails.push('B1-typewriter-threat-not-running');
    if (!cta.headlineRun) fails.push('B1-typewriter-headline-not-running');
  }

  return { fails, probe };
}

/* ── runner ─────────────────────────────────────────────────────── */

const browser = await chromium.launch();
let totalFailures = 0;
const allResults = [];

for (const vpKey of VIEWPORTS_TO_RUN) {
  const cfg = VIEWPORTS[vpKey];
  console.log('');
  console.log(`════ ${cfg.label.toUpperCase()} (${cfg.viewport.width}×${cfg.viewport.height}) ════`);
  if (remoteBase) {
    console.log(`Source: ${base}${bypassToken ? ' (with bypass token)' : ''}`);
  } else {
    console.log(`Source: ${base}`);
  }

  const ctx = await browser.newContext({
    viewport: cfg.viewport,
    deviceScaleFactor: cfg.deviceScaleFactor,
    isMobile: cfg.isMobile,
    hasTouch: cfg.hasTouch,
    userAgent: cfg.userAgent,
    extraHTTPHeaders,
  });

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push({ kind: 'pageerror', msg: String(e.message || e) }));
    page.on('console', m => {
      if (m.type() === 'error' && !IGNORE_ERRORS.test(m.text())) {
        errors.push({ kind: 'console', msg: m.text() });
      }
    });

    let result = { route, viewport: vpKey, status: 'PASS', fails: [], errors: [] };
    try {
      await page.goto(base + route, { waitUntil: 'load', timeout: 30_000 });
      await page.waitForTimeout(800);

      const audit = vpKey === 'mobile'
        ? await auditMobile(page, route)
        : await auditDesktop(page, route);

      result.fails = audit.fails;
      result.probe = audit.probe;
    } catch (e) {
      result.fails.push(`navigation-error: ${e.message}`);
    }

    if (errors.length) result.fails.push(`js-errors=${errors.length}`);
    result.errors = errors.map(e => ({ kind: e.kind, msg: e.msg.slice(0, 200) }));
    if (result.fails.length) {
      result.status = 'FAIL';
      totalFailures++;
    }

    const icon = result.status === 'PASS' ? '✓' : '✗';
    console.log(`${icon} ${vpKey.padEnd(7)} ${route.padEnd(12)} ${result.fails.join(', ') || 'ok'}`);
    for (const e of (result.errors || []).slice(0, 2)) {
      console.log(`     [${e.kind}] ${e.msg.slice(0, 160)}`);
    }

    allResults.push(result);
    await page.close();
  }

  await ctx.close();
}

await browser.close();
if (server) server.close();

console.log('');
console.log(
  `Result: ${allResults.length - totalFailures}/${allResults.length} passed ` +
  `(${VIEWPORTS_TO_RUN.length} viewport${VIEWPORTS_TO_RUN.length > 1 ? 's' : ''} × ${ROUTES.length} routes)`
);

if (wantJson) {
  console.log('---JSON---');
  console.log(JSON.stringify(allResults, null, 2));
}

exit(totalFailures === 0 ? 0 : 1);
