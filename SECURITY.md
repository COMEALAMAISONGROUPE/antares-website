# Security policy

## Supported scope

This file covers the **antares-website** repo — the marketing site
at <https://antaresscan.com>. The Chrome extension and its backend
live in [`antares-extension`](https://github.com/antaresscan/antares-extension)
and have their own disclosure flow. If you're unsure which side of
the system a finding affects, file under either repo — we'll route
it.

## How to report a vulnerability

Two options, in order of preference:

1. **Private GitHub Security Advisory** — go to the repo's
   [Security tab](https://github.com/antaresscan/antares-website/security)
   → "Report a vulnerability". This creates a private discussion
   only repo maintainers can see.
2. **Email** — `security@antaresscan.com` (PGP key available on
   request). Include:
   - A clear description of the issue
   - Steps to reproduce (URL, payload, browser, etc.)
   - Impact (what an attacker could do)
   - Your name / handle for credit if you'd like

Please don't open a public GitHub issue for a vulnerability — that
exposes users before we can ship a fix.

## What's in scope

The site itself, the assets it serves (JS, CSS, fonts, images), the
deployed configuration (Vercel headers, rewrites, redirects), and
anything reachable from the site's surface. Examples:

- XSS via any input the site renders (URL params, form fields)
- CSP bypasses
- Broken or missing security headers (CSP, HSTS, X-Frame-Options, …)
- Mixed content (HTTPS page loading HTTP resource)
- Subresource Integrity gaps that allow swapping a third-party file
- Privacy: data exfiltrating to unexpected third parties
- Open redirects from `/token?ca=…` or any rewrite

## What's out of scope

- The Chrome extension itself — file against `antares-extension`.
- Self-XSS that requires a victim to paste attacker-supplied code
  into their own devtools.
- Findings from automated scanners without proof of exploitability.
- Missing security headers that have a documented exception in
  `docs/ARCHITECTURE.md` §6 (we use `script-src 'unsafe-inline'`
  intentionally because the site has no build step → no nonce path).
- Issues that require attacker-controlled DNS, MITM at the network
  layer, or root on the victim's machine.
- Vulnerabilities in deprecated or unsupported browsers.

## What to expect after you report

- **Within 48 hours**: acknowledgement that we received the report.
- **Within 7 days**: an initial assessment — severity, scope,
  reproducibility.
- **Within 30 days**: a fix shipped to production, OR a clear
  explanation of why the issue isn't actionable.

We'll keep you informed throughout. With your consent, we'll
publicly credit you in the CHANGELOG and any associated GitHub
Security Advisory once the fix is live.

## Bug bounty

We don't run a formal bounty program. We're a small team. We do
appreciate responsible disclosure and will publicly credit
reporters who follow this policy.
