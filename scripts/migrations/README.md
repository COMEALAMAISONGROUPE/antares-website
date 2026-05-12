# One-shot migrations

Scripts in this folder have **already been applied** to the
codebase. They're kept around as historical record — each one
documents WHAT the corresponding PR did to the HTML/CSS/JS at the
moment it shipped, so you can read the script to understand the
intent and re-run it (idempotently) on the working tree if you
ever need to rebuild from a known state.

| Script                          | What it did                                                                    | Shipped in |
|---------------------------------|--------------------------------------------------------------------------------|------------|
| `add-mobile-fixes-link.mjs`     | Added `<link href="/css/mobile-fixes.css">` to every page                      | early mobile pass |
| `migrate-nav-account.mjs`       | Pulled inline auth-aware nav code into `/js/nav-account.js`                    | PR before #150 |
| `migrate-hero-effects.mjs`      | Pulled particles + cursor-glow + reveal-observer into `/js/hero-effects.js`    | same |
| `migrate-burger-inline.mjs`     | Replaced inline burger CSS/JS on 15 pages with `/js/burger.js`                 | PR #149 |
| `add-cta-rewrite-script.mjs`    | Added `<script src="/js/mobile-cta-rewrite.js">` to pages with nav CTAs        | mobile pass |
| `migrate-base-css.mjs`          | Wired `/css/base.css` link + stripped 4 universal rules from 18 pages          | PR #184 |
| `migrate-base-css-body.mjs`     | Stripped the universal body rule (`body{background…}`) from 17 pages           | PR #185 |
| `add-a11y-script.mjs`           | Added `<script src="/js/a11y.js">` (skip-link injector) to 19 pages            | PR #190 |
| `add-pwa-tags.mjs`              | Added `<link rel="manifest">` + `<meta name="theme-color">` to 21 pages        | PR #191 |
| `download-fonts.mjs`            | Pulled WOFF2 latin subset of Bebas Neue + IBM Plex Mono into `/fonts/`         | PR #192 |
| `strip-google-fonts.mjs`        | Removed Google Fonts `<link>` + preconnects from every HTML page               | PR #192 |
| `add-breadcrumb-jsonld.mjs`     | Inserted Schema.org BreadcrumbList JSON-LD on 18 non-home routes               | PR #196 |

## Idempotency

Every script in here is safe to re-run. They check whether their
change is already applied and skip pages that are. So running

```bash
node scripts/migrations/migrate-base-css.mjs
```

after PR #184 has been merged is a no-op — every page already has
the `<link>` and the 4 inline rules are already stripped.

## When to add a new one

If a PR makes a bulk change across many HTML files (more than ~5),
prefer writing it as a migration script + committing the script
alongside the resulting diff. That way:

- Reviewers can read the script to understand the change pattern,
  not have to diff 20 files line-by-line.
- The script becomes a record of why those files diverge from any
  pre-existing baseline.
- The same script can be re-run if a downstream branch goes stale.

Recurring tools (run repeatedly, not one-shot) belong in `scripts/`
not here. Today those are: `audit.mjs`, `install-hooks.mjs`,
`regenerate-sitemap.mjs`, `regenerate-changelog.mjs`.
