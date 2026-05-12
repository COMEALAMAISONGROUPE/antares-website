# Architecture

Why this static site looks the way it does — the conventions, the
contracts the audit enforces, and the past incidents that shaped both.

If you're touching anything that affects more than one page, read this
first.

---

## 1. Big picture

- **Static HTML.** No framework, no build step. Each page is a single
  `*.html` at the repo root.
- **One page = one file.** No partials, no template engine. Repetition
  is the cost; predictability + zero build pipeline is the benefit.
- **Vercel hosts it.** `cleanUrls: true` rewrites `/pricing` → `/pricing.html`
  etc. All rewrites declared in `vercel.json`.
- **Shared concerns live in `/css` and `/js`.** Anything that has to
  behave identically across pages (mobile drawer, account state, home
  animations) lives there as one file, loaded on every page that needs
  it via `<link>` / `<script defer>`.
- **The audit gates everything.** `scripts/audit.mjs` runs at every
  PR via `.github/workflows/audit.yml` and runs at both viewports
  against every public route. It encodes the contracts in this doc.

## 2. CSS architecture

### The split

```
Inline <style> in *.html          → desktop layout for that page
css/mobile-fixes.css              → ALL mobile overrides (<761 px)
css/home-animations.css           → home-page A1 + B1 keyframes
```

That's it. Three places. Nothing else.

### Why the inline `<style>` block stayed

Pulling page-specific desktop CSS into shared files would force every
PR to touch shared state and would multiply the surface area for
cross-page regressions. The audit catches mobile regressions but
desktop diffs are still mostly per-page, so per-page styles localize
the risk.

### Why `css/mobile-fixes.css` is one big file

Mobile overrides are deeply cross-cutting (nav, drawer, footer, every
page-specific section). Splitting them would force every page to load
N files or force the maintainer to remember which file to edit for a
given selector. One file = one source of truth.

> **Hard rule:** the only mobile media query in the codebase is
> `@media (max-width: 760px)` inside `css/mobile-fixes.css`. Don't add
> mobile rules to inline `<style>` blocks. PR #146 broke checkout by
> injecting mobile CSS into a JS string; the audit's mobile assertions
> exist to catch that pattern.

### Body class opt-in

`css/mobile-fixes.css` is loaded on every page that has a mobile
override (so: every page). But not every override should apply
everywhere. So pages tag themselves via a `<body class="…">`:

| Body class       | What it opts into                                       | Used on |
|------------------|---------------------------------------------------------|---------|
| `is-home`        | Home hero + animations + hidden mobile footer           | `/` |
| `short-mobile`   | Compact section spacing / padding on mobile             | `/about`, `/api`, `/security`, `/support`, `/changelog` |
| `legal-page`     | Typography pass for long-form legal copy                | `/privacy`, `/terms` |
| `is-demo`        | Demo-only mobile tweaks                                 | `/demo` |
| `is-compare`     | Compare-table mobile reflow                             | `/compare` |
| `is-pricing`     | Pricing-table mobile reflow                             | `/pricing` |
| `menu-open`      | Added by `js/burger.js` when the drawer is open         | runtime only |

Pages without any class get the generic-content mobile defaults.

## 3. JS architecture

### Loading pattern

Every shared JS is loaded with `defer`:

```html
<link rel="stylesheet" href="/css/mobile-fixes.css">
<script src="/js/burger.js" defer></script>
<script src="/js/mobile-cta-rewrite.js" defer></script>
<script src="/js/nav-account.js" defer></script>
```

`defer` means the browser keeps streaming HTML while the script
downloads, and the scripts run in order after the DOM is ready. This
is why all the modules self-init from a `DOMContentLoaded` listener
(or check `document.readyState` and init directly).

### Self-init + idempotent

Every shared module:
1. Self-initializes on load — no caller needs to invoke it.
2. Is idempotent — running `init()` twice has no effect (use
   `dataset.wired = '1'` flags or DOM existence checks).

This matters because some pages also ship inline JS that does similar
work (the home hero, for example), and load order isn't guaranteed.

### `js/burger.js` — state-aware injection

The hairiest module. It runs through **four** states of `<button class="nav-burger">` × `<div id="mobile-menu">`:

| Button | Drawer | Action                                                      |
|--------|--------|-------------------------------------------------------------|
| ✓      | ✓      | Wire idempotently and return                                |
| ✓      | ✗      | Drop the orphan button, inject a fresh pair                 |
| ✗      | ✓      | Drop the orphan drawer, inject a fresh pair                 |
| ✗      | ✗      | Inject a fresh pair                                         |

State 2 (button without drawer) was a real bug introduced by PR #146,
which shipped the inline burger button to 15 pages but forgot the
drawer markup on some of them. PR #177 made `burger.js` self-heal that
case. The audit now asserts that state 2 never ships again (drawer
markup must be present after `burger.js` runs).

## 4. Audit contracts

`scripts/audit.mjs` is not just a smoke test — it codifies hard-won
contracts that aren't expressible in the type system (there is no type
system). Each contract maps to a past regression.

### Mobile contracts (per route)

| Contract                                | Source incident |
|-----------------------------------------|-----------------|
| Zero horizontal overflow                | Every responsive layout change |
| Burger button rendered + visible        | PR #146 outliers (`/faq`, `/proof`) |
| Drawer markup (`#mobile-menu`) exists   | PR #146 (same pages) |
| Tap on burger opens drawer in ≤ 400 ms  | PR #146 ghost burger (button shipped, no handler) |
| Home footer hidden, others visible      | PR #168 / #169 (footer state contract) |
| No uncaught JS errors                   | Generic safety net |

### Desktop contracts (per route)

| Contract                                | Source incident |
|-----------------------------------------|-----------------|
| Overflow ≤ 17 px (scrollbar gutter)     | Generic |
| Nav links group visible                 | Regression on legal-page nav simplification |
| `<h1>` exists and is non-empty          | SEO hygiene |
| Footer span color = footer color        | PR #167 — "No mercy for scammers" briefly painted mint |
| No uncaught JS errors                   | Generic safety net |

### Desktop home-only contracts

| Contract                                                                                                       | Source incident |
|----------------------------------------------------------------------------------------------------------------|-----------------|
| `#loss-counter.textContent === "2.8"` after `.loss-strip` scrolls into view                                    | PR #166 A1 — counter tick-up |
| `.cta-final h2` and `.cta-threat` reach `.typewrite-run` (+ `.typewrite-done`) after `.cta-final` scrolls in   | PR #166 B1 — typewriter |

Pages with simplified nav (`/privacy`, `/terms`) skip the burger /
links assertions since they're expected to ship `<a brand><a back>`
only.

## 5. Routing

`vercel.json` rewrites + `cleanUrls: true` give us `/pricing` →
`/pricing.html`. **Don't** combine `cleanUrls` with rewrites that
target a sub-folder path (`/pages/foo.html`) — PR #153 tried that and
Vercel canonicalized everything back to 404. If you ever want to fold
files into a sub-folder, drop `cleanUrls` and live with `.html` in URLs.

### Cache rules per route

`vercel.json` declares cache-control per route. Important ones:

| Route                  | Cache                                  | Why |
|------------------------|----------------------------------------|-----|
| `/`, generic pages     | Vercel default (CDN edge cache)        | OK to cache aggressively |
| `/pricing`             | `no-store, max-age=0`                  | Pricing changes; never serve stale |
| `/auth`, `/account`    | `no-store, max-age=0`                  | Session-dependent |
| `/demo`                | `max-age=0, must-revalidate`           | Demo data changes; revalidate every load |
| `/favicon.png`         | `max-age=31536000, immutable`          | Versioned by browser; safe to pin |

`/js/*` is **not** declared in `vercel.json` and defaults to Vercel's
1-year immutable cache. This is a footgun: any change to a JS file
must bust the cache via a query string (`<script src="/js/foo.js?v=2">`).
See `MEMORY.md::project_vercel_cache` for the war story.

## 6. Security headers

Set on every route via `vercel.json`:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; …
```

CSP allowlist:
- `script-src 'self' 'unsafe-inline'` — inline scripts everywhere; no
  build step means no nonce/hash path, `'unsafe-inline'` is the price.
- `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` —
  inline `<style>` blocks + Google Fonts CSS.
- `font-src 'self' https://fonts.gstatic.com` — actual font files.
- `connect-src 'self' https://antares-extension.vercel.app https://api.dexscreener.com`
  — auth/payment/scan API + the demo's price-data API.
- `frame-src https://dexscreener.com` — the demo embeds a price
  chart iframe from dexscreener.
- `img-src 'self' data:` — local PNGs plus inline data: SVGs.
- `frame-ancestors 'none'` — we don't allow being framed (matches
  `X-Frame-Options: DENY`).

The audit applies these headers when serving locally, so CSP
violations from a new endpoint show up as `js-errors=N` and fail CI.
If you add a fetch to a new third-party domain, update CSP first.

If you ever need to allow iframing (e.g. embedding the demo elsewhere),
do it per-route with a more permissive `X-Frame-Options`, not globally.

## 7. The auth integration

Login state is read by `js/nav-account.js`, which calls the
`antares-extension` backend (different repo) and swaps the nav CTA
from "Log in" to "Account" when authenticated. The backend lives at
<https://antares-extension.vercel.app>. See `AUTH-SETUP.md` for the
operational details (env vars, session secret, payment dispatcher).

Front-end has **no** secrets. Everything sensitive lives on the
extension backend and is reached over CORS. If the backend errors,
`nav-account.js` must fail silently — never crash the page. PR #488
on `antares-extension` converted Redis crashes into proper 503/CORS
responses so the front never sees raw "Failed to fetch".

## 8. Past incidents (the short list)

Stuff worth remembering before you change anything:

- **PR #146** — shipped inline burger button to 15 pages, forgot the
  drawer on some. Cause of the state-aware re-injection in `burger.js`
  and the drawer-markup audit assertion.
- **PR #153** — tried to move HTML into `/pages/` with rewrites. Broke
  prod 404. Lesson: don't combine `cleanUrls` with sub-folder rewrites.
- **PR #166** — added A1 counter tick-up + B1 typewriter on home. The
  audit now asserts both animations complete on desktop.
- **PR #167** — "No mercy for scammers" briefly painted mint instead
  of the footer grey. Audit asserts footer span color = footer color.
- **PR #168 / #169** — mobile footer should be hidden on home,
  visible on every other page. Audit asserts the contract.
- **PR #177** — state-aware burger injection (the table in section 3).
- **PR #180** — this audit + the 6-page burger fix that brought the
  state-2 bug pattern home.

Reading the PR descriptions in <https://github.com/COMEALAMAISONGROUPE/antares-website/pulls?q=is%3Apr+is%3Aclosed> is the fastest way to understand
why a given rule exists.

## 9. Accessibility

What's wired up:
- `.nav-burger` has `aria-label`, `aria-expanded`, `aria-controls`
- `<nav>` has `aria-label="Main navigation"`
- Logo `<img>` has `alt="Antares Logo"`
- `:focus-visible` outline (in `css/base.css`) — visible focus ring
  on keyboard navigation, invisible on mouse clicks
- `prefers-reduced-motion` (in `css/base.css`) — freezes the stripe
  gradient, particle drift, scroll-triggered fades and typewriter
  sweeps when the user has reduced-motion set in their OS

Known gaps (worth fixing if the trade-off comes up):
- No skip-link (would let keyboard users jump past the nav)
- Color contrast on `#454550` nav links over `#0a0a0c` background is
  on the low end of WCAG AA at ~4.0:1
- Animations beyond the stripe/particles aren't gated behind reduced
  motion preference (the JS-driven counter and typewriter still run)

## 10. Things that are deliberately not in the codebase

- **No CSS preprocessor.** Sass/PostCSS would buy us nesting and
  variables. We already have CSS custom properties for variables and
  nesting isn't worth the build step.
- **No bundler.** Each JS module is a plain IIFE and small enough
  (< 10 KB each) that bundling wouldn't shave a meaningful amount.
- **No service worker.** The site is updated frequently; caching it
  client-side would have caused multiple of the past incidents.
- **No analytics framework client-side.** Vercel Analytics is enabled
  server-side and that's all we need.

If you want to introduce any of the above, the bar is: name a concrete
incident it would have prevented, or a concrete page weight win
worth the build step.
