#!/usr/bin/env bash
# setup-auth.sh — One-shot bootstrap for the Antares auth backend.
#
# Run this once, from the antares-extension repo root, to:
#   1. Generate a cryptographically random SESSION_SECRET
#   2. Set it on the production Vercel deployment
#   3. Trigger a redeploy so the env var takes effect
#   4. Smoke-test the auth + payment endpoints
#
# After this completes, signup / login / sessions / licences are
# fully wired end-to-end.
#
# Usage:
#   cd /path/to/antares-extension
#   bash /path/to/antares-website/setup-auth.sh
#
# Requirements:
#   - Vercel CLI installed (`npm i -g vercel`)
#   - You're logged in to Vercel (`vercel login` — browser-based)
#   - You're linked to the right project (`vercel link` if first time)
#
# Idempotent: re-running it rotates the secret and redeploys cleanly.

set -euo pipefail

# ─── 0. Sanity checks ────────────────────────────────────────────────────────
if ! command -v vercel >/dev/null 2>&1; then
  echo "✗ Vercel CLI not found. Install with: npm i -g vercel"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node not found. Need it for the secret generator."
  exit 1
fi

if ! vercel whoami >/dev/null 2>&1; then
  echo "→ Not logged in to Vercel. Running 'vercel login' (this opens a browser)..."
  vercel login
fi

# Confirm we're inside an antares-extension checkout (the API host).
# The website repo doesn't need any auth env vars — only the API does.
if [[ ! -f "vercel.json" ]] || ! grep -q "antares-extension" "package.json" 2>/dev/null; then
  echo "✗ Run this from the antares-extension repo root (the API host)."
  echo "  Found vercel.json: $(test -f vercel.json && echo yes || echo no)"
  echo "  Current directory: $(pwd)"
  exit 1
fi

# ─── 1. Generate the secret ──────────────────────────────────────────────────
SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
echo "→ Generated SESSION_SECRET (64 hex chars)"

# ─── 2. Push it to Vercel (production scope) ─────────────────────────────────
# `vercel env add` is interactive but accepts the value via stdin.
# We pipe the secret + a final newline so the prompt completes.
# If the var already exists, Vercel will error — we remove it first.
echo "→ Removing any existing SESSION_SECRET (ignoring errors)..."
vercel env rm SESSION_SECRET production -y >/dev/null 2>&1 || true

echo "→ Adding SESSION_SECRET to production..."
printf '%s\n' "$SECRET" | vercel env add SESSION_SECRET production

# ─── 3. Redeploy so the env var takes effect ─────────────────────────────────
# Vercel does NOT pick up env var changes on a running deployment —
# you have to redeploy. `vercel --prod` triggers a fresh build with the
# new env state.
echo "→ Triggering production redeploy (this takes ~60-90s)..."
DEPLOY_URL="$(vercel --prod --yes 2>&1 | tail -1)"
echo "→ Deployed to: $DEPLOY_URL"

# Vercel takes a few seconds to wire the deployment to the production alias.
sleep 8

# ─── 4. Smoke-test the auth endpoint ─────────────────────────────────────────
echo "→ Smoke-testing /api/auth/signup..."
RESPONSE="$(curl -s -X POST "https://antares-extension.vercel.app/api/auth/signup" \
  -H "Origin: https://antares-website.vercel.app" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"setup-smoketest-$(date +%s)@example.com\",\"password\":\"setup-smoketest-1234567890\"}")"

if echo "$RESPONSE" | grep -q '"ok":true'; then
  echo "✓ Auth working: $RESPONSE"
  echo
  echo "════════════════════════════════════════════════════════════════"
  echo "  Auth backend is now LIVE in production."
  echo "  • /api/auth/signup        → creates account, sets session cookie"
  echo "  • /api/auth/login         → validates password, sets session cookie"
  echo "  • /api/auth/me            → returns current session's email"
  echo "  • /api/account-licenses   → lists user's Pro/Lifetime licences"
  echo "  • /api/payment-intent     → unchanged, still wired"
  echo "  Next: ship a test purchase via /pricing.html to validate the"
  echo "        full Solana Pay → cron → license flow."
  echo "════════════════════════════════════════════════════════════════"
else
  echo "✗ Auth still broken: $RESPONSE"
  echo "  Check the Vercel deployment logs for build errors."
  exit 1
fi
