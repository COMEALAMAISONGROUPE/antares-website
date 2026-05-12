# antares-website

Marketing site for **Antares** — the Solana rug-detection Chrome
extension. Static HTML, no build step, deployed on Vercel.

Live: <https://antaresscan.com>
Sister repo (the extension + backend): [`antares-extension`](https://github.com/COMEALAMAISONGROUPE/antares-extension)

---

## What's in this repo

| Path                              | What it is |
|-----------------------------------|-----------|
| `*.html` (top level)              | One file per route. Each page is self-contained: `<style>` for desktop, links to shared CSS/JS for shared concerns. |
| `css/mobile-fixes.css`            | All mobile (<761 px) overrides. The single source of truth for mobile layout — never edit inline `<style>` for mobile. |
| `css/home-animations.css`         | Counter + typewriter keyframes used only on `/`. |
| `js/burger.js`                    | Mobile drawer. Auto-injects on any page that has a `.nav-burger` button. State-aware: handles all four "button × drawer present/missing" combinations. |
| `js/nav-account.js`               | Swaps "Log in" → "Account" in the nav when a session cookie is present. |
| `js/mobile-cta-rewrite.js`        | Mobile-only: pulls every desktop nav `.cta` into the drawer so the top bar stays clean. |
| `js/hero-effects.js`              | Particles + parallax on the home hero. Gated behind `body.is-home`. |
| `js/home-animations.js`           | A1 counter tick-up + B1 typewriter on the home page only. |
| `js/faq-accordion.js`             | Q&A accordion behaviour for `/faq` and `/support`. |
| `vercel.json`                     | `cleanUrls: true` + per-route rewrites + security headers + per-route cache rules. |
| `scripts/audit.mjs`               | Playwright-based regression audit. Runs both viewports against every public route. CI gates every PR on this passing. |
| `.github/workflows/audit.yml`     | Wires the audit to `pull_request` and `push: main`. Two jobs: local-static-server audit + Vercel-preview audit (latter needs `VERCEL_BYPASS_TOKEN` secret — see `docs/ci-setup.md`). |
| `docs/ARCHITECTURE.md`            | Deeper map of CSS/JS conventions and the body-class opt-in pattern. Read this before touching anything cross-page. |
| `docs/ci-setup.md`                | One-time setup for the Vercel preview audit secret. |
| `AUTH-SETUP.md`                   | Operational runbook for the auth + payment pipeline (cross-repo with `antares-extension`). |
| `_audit/`, `_screenshots/`        | Local-only artifacts (gitignored). |

## Public routes

Each is served via Vercel `cleanUrls` from the matching `*.html`:

```
/                /demo         /features       /engine
/compare         /pricing      /install        /sources
/proof           /faq          /changelog      /about
/api             /security     /support        /auth
/account         /privacy      /terms
```

`/token?ca=…` redirects out to the extension's backend (302).

## Run locally

The site is plain HTML — open any `*.html` directly in a browser, or
run a static server for cleanUrls + relative paths to work the way they
do in production:

```bash
# Python (no install)
python3 -m http.server 8000

# Node
npx serve .
```

To exercise the audit (Playwright is installed via `package.json` — npm
install once):

```bash
npm install              # installs playwright
node scripts/audit.mjs                   # both viewports, all 19 routes
node scripts/audit.mjs --viewport=mobile # mobile only
node scripts/audit.mjs --viewport=desktop
node scripts/audit.mjs --base=https://antaresscan.com   # audit prod
```

The audit exits non-zero on any regression and prints which routes
failed which contract.

## Deploy

Push to `main` → Vercel rebuilds and promotes to <https://antaresscan.com>.
Pushes to any other branch get a preview URL. The audit gates merges
into `main` via `.github/workflows/audit.yml`.

## Adding a new page

1. Create `newpage.html` at the repo root. Copy the head + nav from
   `about.html` (the simplest one) as a starting point.
2. Add the rewrite to `vercel.json`:
   ```json
   { "source": "/newpage", "destination": "/newpage.html" }
   ```
3. Link `css/mobile-fixes.css` in `<head>` and `js/burger.js` so the
   mobile drawer wires itself up. Add `mobile-cta-rewrite.js` if the
   page has nav CTAs.
4. Pick a `<body>` class if the page has special needs:
   - `is-home` → home-specific styles + animations
   - `short-mobile` → compact spacing pattern (about, security, …)
   - `legal-page` → typography for `/privacy`, `/terms`
   - `is-demo`, `is-compare`, `is-pricing` → page-specific tweaks
5. Add the route to `scripts/audit.mjs` `ROUTES` array and re-run the
   audit locally. Make sure both viewports pass.
6. Open a PR. CI must be green before merge.

## Why some things look the way they do

A lot of the code is shaped by past incidents. Before changing
anything cross-page, skim `docs/ARCHITECTURE.md` — it documents the
contracts the audit enforces and why each exists.

## Conventions

- Inline `<style>` blocks are for **desktop** styling only. All mobile
  rules live in `css/mobile-fixes.css`. PR #146 broke checkout by
  injecting CSS into an inline `<script>` string — don't do that.
- Mobile = `max-width: 760px`. Don't introduce other breakpoints; the
  audit only exercises 375 × 812 and 1280 × 800.
- Body class opt-in pattern. Mobile-fixes.css is loaded everywhere; the
  body class is what tells it which overrides to apply. Default state
  (no class) targets generic content pages.
- Cache-busting JS changes: bump the query string on the `<script>`
  tag (`?v=2`). Vercel caches `/js/*` for a year — see
  `MEMORY.md::project_vercel_cache`.
- Don't ship a `.nav-burger` button without `<div id="mobile-menu">`
  in the same page. The audit catches this, but better not to hit it.
