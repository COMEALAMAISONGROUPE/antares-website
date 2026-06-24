# Contributing

Quick reference for anyone (including future-you) touching this repo.

## Local setup

```bash
git clone https://github.com/antaresscan/antares-website.git
cd antares-website
npm ci                       # installs playwright + linters
npm run hooks:install        # optional: pre-commit runs lint
```

## Run before you push

```bash
npm run lint                 # HTMLHint + Stylelint (under 1 s)
npm test                     # full Playwright audit (about 90 s)
```

Both run in CI on every PR. The audit and lint each gate the merge.

## Branch & PR conventions

**Branch names** — short kebab-case, prefixed by the kind of change:

```
fix-mobile-burger-orphan
feat-home-counter-animation
perf-fonts-self-host
refactor-css-base-extraction
chore-sitemap-regen
docs-architecture-extension
ci-audit-coverage
```

**PR titles & commit messages** — [conventional commits](https://www.conventionalcommits.org/):

```
type(scope): short imperative description
```

Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `style`,
`test`, `chore`, `build`, `ci`, `revert`. Scope is optional but
nice: `(mobile)`, `(home)`, `(a11y)`, `(repo)`, `(security+a11y)`.

The CHANGELOG generator (`npm run regen:changelog`) only picks up
commits matching this pattern, so it's worth following.

## PR body

Use this skeleton:

```md
## Summary
- Bullet list of what changed.
- Include WHY when it's not obvious.

## Test plan
- [x] `npm test` passes 38/38 locally
- [ ] CI green
- [ ] Manual check (if applicable): describe the user-facing flow
```

If a real bug is fixed, mention it explicitly — that helps the next
person searching `git blame`.

## When something runs in CI

`.github/workflows/audit.yml` runs on every push and PR against
`main`. Two jobs:

1. **Local audit** — boots a static server against the working tree,
   runs Playwright + axe-core against 19 routes × 2 viewports + the
   vercel.json security headers. Fast (< 3 min).
2. **Vercel preview audit** — same script against the Vercel
   preview URL. Gated on the `VERCEL_BYPASS_TOKEN` repo secret;
   see `docs/ci-setup.md`.

## Don't ship without

- `npm run lint` clean — HTMLHint catches duplicate IDs / missing
  alt / mismatched tags; Stylelint catches invalid properties and
  duplicate declarations.
- `npm test` 38/38 — the audit encodes the contracts you'll
  otherwise regress (drawer markup, home animations land, footer
  color, axe a11y rules, CSP enforcement, …).

## Architecture & invariants

Before touching anything cross-cutting, read `docs/ARCHITECTURE.md`.
It documents the CSS/JS conventions, the body-class opt-in pattern,
the four-state burger injection table, every audit contract mapped
to the PR that produced it, and the Vercel `/js/*` immutable-cache
footgun.

## Adding a new page

1. Create `newpage.html` at the repo root. Copy the head + nav
   from `about.html` (the simplest one).
2. Add the rewrite to `vercel.json`:
   ```json
   { "source": "/newpage", "destination": "/newpage.html" }
   ```
3. The page picks up `css/base.css` (universal rules + fonts) and
   `js/a11y.js` (skip-link + scrollable-region tabindex) once you
   add their `<link>` / `<script>` tags. Also load
   `css/mobile-fixes.css` and `js/burger.js` if the page has a nav.
4. Pick a `<body>` class if the page has special needs:
   `is-home`, `short-mobile`, `legal-page`, `is-demo`, `is-compare`,
   `is-pricing`. Default state (no class) targets generic content.
5. Add the route to `scripts/audit.mjs`'s `ROUTES` array. Re-run
   the audit locally — make sure both viewports pass.
6. Run `npm run regen:sitemap` to add the page to `sitemap.xml`.

## Filing a security report

See `SECURITY.md`.
