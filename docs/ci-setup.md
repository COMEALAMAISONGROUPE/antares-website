# CI setup — Vercel preview audit

## What it does

The `audit-preview` job in `.github/workflows/audit.yml` runs the
mobile + desktop regression audit against the **real** Vercel preview
deployment of every PR, not just a local static server.

This is what catches routing / vercel.json bugs before merge — the kind
that broke #153 (the `/pages/` folder move) by passing the local audit
and 404-ing on the deployed site.

## Why it's gated behind a secret

Vercel password-protects preview deployments by default. To let CI in,
we send the per-project automation-bypass secret as an HTTP header on
every request. That secret lives in two places:

1. **Vercel project settings** — defines what the valid bypass value is
2. **GitHub repo secret** — exposes the same value to the CI job

They must match.

## One-time setup

### 1. Generate the bypass secret in Vercel

1. Open the project on Vercel: <https://vercel.com/comealamaisongroupes-projects/antares-website>
2. Settings → **Deployment Protection** → **Vercel Authentication**
3. Scroll to **Protection Bypass for Automation**
4. Click **Add Secret** (or copy the existing one)
5. Copy the generated value

### 2. Add it as a GitHub repo secret

1. Open the repo settings: <https://github.com/COMEALAMAISONGROUPE/antares-website/settings/secrets/actions>
2. Click **New repository secret**
3. **Name:** `VERCEL_BYPASS_TOKEN`
4. **Secret:** paste the value from step 1
5. Save

That's it. The next PR will automatically run the preview audit.

## Without the secret

The `audit-preview` job will skip itself and print a workflow warning.
The local audit still runs and still gates merges — but any change to
`vercel.json`, `cleanUrls`, or folder structure could ship a broken
deployment.

## Verifying it works

After setup, push any small PR. In the Actions tab you should see:

- ✅ `Mobile + desktop audit (local)` — completes in ~5-6m
- ✅ `Mobile + desktop audit (Vercel preview)` — completes in ~3-5m,
  includes a step named "Wait for Vercel preview"

If the preview job ends in ~6 seconds and the run log shows
"VERCEL_BYPASS_TOKEN secret not configured — skipping preview audit",
the secret isn't configured (or its name doesn't match
`VERCEL_BYPASS_TOKEN` exactly).
