# Auth + Payment Setup — Antares

Operational reference for the auth + payment-confirmation pipeline.
Read this when something stops working in production, or before
on-boarding a new admin who needs to keep the lights on.

> **TL;DR**: production currently only needs **one env var set** —
> `SESSION_SECRET` on the `antares-extension` Vercel project. Every
> other moving piece is already wired and verified live.

## Fastest path — one command

Run the bundled bootstrap script from the **antares-extension** repo:

```bash
cd /path/to/antares-extension
bash /path/to/antares-website/setup-auth.sh
```

It:
1. Generates a 32-byte random `SESSION_SECRET`
2. Sets it on the production Vercel deployment via `vercel env add`
3. Triggers a redeploy
4. Smoke-tests `/api/auth/signup` to confirm the fix landed

Total time: ~90 seconds (mostly the Vercel build). One browser-based
`vercel login` may be required the first time. The rest is automatic.

If you'd rather do it by hand, follow §2 below.

---

## 1. The trust model — "we have no third party, how do we know they paid?"

Antares does **not** integrate Stripe, PayPal, or any payment processor.
The chain is the third party.

```
User                 antares-website         antares-extension API           Solana mainnet
 │                          │                         │                            │
 │── click "Get Pro" ──────►│                         │                            │
 │                          │── POST /payment-intent ►│                            │
 │                          │                         │── store reference key ────►│  (Upstash Redis)
 │                          │◄── { payUrl, reference }│                            │
 │◄── show QR + click-to-pay│                         │                            │
 │── sign Solana Pay tx ──────────────────────────────────────────────────────────►│  (USDC or SOL transfer
 │                          │                         │                            │   with `reference` key
 │                          │                         │                            │   in account memo)
 │                          │── poll /payment-status ►│                            │
 │                          │                         │── checkIntentOnChain ─────►│  (Helius RPC scan
 │                          │                         │                            │   for that reference)
 │                          │                         │◄── confirmed tx found ─────│
 │                          │                         │── issueLicense + setTier ──►│  (Upstash Redis)
 │                          │◄── { confirmed, license }                            │
 │◄── license key shown ────│                         │                            │
```

**The reference key is the link.** Each payment intent generates a new
unique `reference` (Solana address, 32 bytes). The Solana Pay URL embeds
it. When the buyer signs the transfer, the reference appears as an
account in the transaction. We scan Solana for transactions
involving that account. Match recipient + token mint + amount → confirm
payment, issue license.

**No way to fake a payment**:
- Reference keys are server-generated randoms (base58, 32 bytes ≈ 256 bits)
- Brute-forcing one is computationally infeasible
- The on-chain check requires `recipient` + `splTokenMint` + `amount` to match exactly
- A user paying the wrong amount or to the wrong wallet → no license issued

**No way to lose a payment**:
- The cron retries every minute (in production-tier Vercel) or daily (Hobby tier)
- Even if the cron crashes between confirmation and license issuance, the
  next tick re-scans the same reference and finds the same on-chain tx
- `issueLicense` is idempotent on `(reference, email)`: multiple cron
  invocations on the same intent never create duplicate licenses

---

## 2. Required environment variables

All set on the **`antares-extension`** Vercel project (the API host).
Nothing on the website project needs configuration for auth/payment.

| Variable | Purpose | Required for |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Redis endpoint | All storage (accounts, licenses, intents) |
| `UPSTASH_REDIS_REST_TOKEN` | Redis auth | All storage |
| `SESSION_SECRET` | HMAC-SHA256 key for JWT session cookies | Sign-up, login, /account |
| `SOLANA_RECIPIENT_WALLET` | The wallet that receives USDC/SOL payments | Payment intents |
| `HELIUS_API_KEY` | Solana RPC for on-chain scanning | Payment cron, scan engine |
| `CRON_SECRET` | Bearer token for manual cron triggers | Manual cron testing |
| `SOLANA_PRICE_PRO_USDC` | Pro tier price (default 24.99) | Payment intents |
| `SOLANA_PRICE_LIFETIME_USDC` | Lifetime tier price (default 149.99) | Payment intents |
| `GEMINI_API_KEY` | LLM provider for AI Summary | Pro/Lifetime feature |
| `SOLSCAN_API_KEY` | Transfer signatures + market structure | Scan engine |
| `SENTRY_DSN` | Error tracking (optional) | Production monitoring |
| `LOG_LEVEL` | Log verbosity (`debug` / `info` / `warn` / `error`) | Operational |
| `DEV_PRO_INSTALLS` | Comma-separated install_ids that get free Pro for dev/QA | Optional |

### Generate SESSION_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or with OpenSSL: `openssl rand -hex 32`.

The value should be **at least 32 bytes** (64 hex chars) of cryptographic
randomness. Keep it secret. Rotating it invalidates every existing
session at once — useful if there's ever a suspected leak.

### Set it on Vercel

```bash
# Pick the env var scope (production, preview, development)
vercel env add SESSION_SECRET production
# Paste the secret when prompted

# Then redeploy the project — Vercel does NOT pick up env var changes
# on running deployments
vercel --prod
```

Or via the Vercel dashboard: **Settings → Environment Variables → Add New**.

---

## 3. Cron — payment confirmation cadence

Configured in `vercel.json`:

```json
"crons": [{
  "path": "/api/cron-check-payments",
  "schedule": "0 0 * * *"
}]
```

**This runs once a day at 00:00 UTC** — that's the Vercel Hobby plan
limit. A user paying at 12:01 AM would wait ~24 hours for their
license to land.

**Two options to fix this**:

1. **Upgrade Vercel to Pro plan** ($20/month) → cron can run every
   minute (`* * * * *`). Best UX. Recommended once revenue justifies
   it.

2. **Client-driven confirmation** (already implemented): the Solana
   Pay modal on `/pricing.html` polls `GET /api/payment-status?reference=…`
   every 3 seconds. The endpoint *itself* re-runs the on-chain check
   on every poll (not just reading cron state), so the modal flips
   to "confirmed" as soon as the chain confirms the transfer —
   typically 5-15 seconds after the user signs. The license is
   issued in the same response. The cron is then just a safety net
   for users who closed the tab before confirmation.

So even on the daily cron, **the buyer's experience is real-time** —
they don't wait 24 hours. The cron exists to clean up stragglers, not
to deliver licenses on the happy path.

### Manually trigger the cron (dev / debug)

```bash
curl -X POST "https://antares-extension.vercel.app/api/cron-check-payments" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Returns `{ scanned, confirmed, expired, errors }`.

---

## 4. Smoke-tests for production

Run these as a quick post-deploy health check:

```bash
# Auth: signup with a random email should return 200 {ok:true}
# (NOT 503 "Auth not configured on this deployment")
curl -s -X POST "https://antares-extension.vercel.app/api/auth/signup" \
  -H "Origin: https://antares-website.vercel.app" \
  -H "Content-Type: application/json" \
  -d '{"email":"smoketest-'$(date +%s)'@example.com","password":"smoketest-1234567890"}'

# Auth: /api/auth/me with no cookie should return 401 not_authenticated
curl -s "https://antares-extension.vercel.app/api/auth/me" \
  -H "Origin: https://antares-website.vercel.app"

# Payment: intent should return a real Solana Pay URL
curl -s -X POST "https://antares-extension.vercel.app/api/payment-intent" \
  -H "Origin: https://antares-website.vercel.app" \
  -H "Content-Type: application/json" \
  -d '{"tier":"monthly","token":"USDC","install_id":"smoketest_aaaaaaaaa"}'
```

Expected outcomes:
- Signup → `{"ok":true,"email":"…"}` and a `Set-Cookie: antares_session=…` header
- /me → `{"ok":false,"reason":"not_authenticated"}`
- Payment intent → `{"reference":"...","payUrl":"solana:...","token":"usdc","amount":24.99,...}`

If signup returns `503 "Auth not configured on this deployment"`,
**SESSION_SECRET is missing**. Fix it per §2.

---

## 5. Data flow — what is stored where

| Key | Type | Holds | TTL |
|---|---|---|---|
| `account:<email_lc>` | hash | id, email, scrypt password hash, createdAt | none |
| `account:install:<install_id>` | string → email_lc | reverse lookup | none |
| `license:<key>` | hash | tier, email, amountUsd, redeemed, redeemedBy, expiresAt | none |
| `license:by-email:<email_lc>` | set | license keys owned by this email | none |
| `intent:<reference>` | hash | tier, token, amount, recipient, status (pending/confirmed/expired) | 30 min |
| `intent:pending` | set | references the cron should re-scan | none |
| `user:<install_id>:tier` | string | "free" / "pro" / "lifetime" | matches license expiry |
| `user:<install_id>:tierExpires` | string | epoch-ms when Pro downgrades to Free | n/a for Lifetime |
| `user:<install_id>:history` | list | last 1000 scan history entries | trimmed at 1000 |
| `ratelimit:<ip>` | string | rate-limit bucket | 60s |

Sessions (JWT) are **stateless** — not stored server-side. The only way
to revoke every session at once is to rotate `SESSION_SECRET`. If we
need fine-grained per-token revocation later, we can add a server-side
allowlist key (`session:<sub>:active`) and check it in `verifySession`.

---

## 6. The two identifiers — why both exist

| | Used by | Persists across | Carries |
|---|---|---|---|
| `email` | website auth, payment receipt, account dashboard | re-installs, devices | identity |
| `install_id` | extension scan engine, tier-gated features | this browser's extension data | install |

A buyer pays with their **email**. The license is issued tied to that
email. They redeem the license in the **extension**, which binds the
license to their `install_id`. From then on, the extension reads tier
from `user:<install_id>:tier` on every scan.

Why not unify? Because the extension can't see your email without
permission, and forcing email at install would crater the install rate.
The split is intentional.

---

## 7. Rotating SESSION_SECRET

If the secret is suspected leaked (or as a periodic security practice):

1. Generate a new secret per §2
2. `vercel env rm SESSION_SECRET production` then `vercel env add` the new value
3. `vercel --prod` to redeploy
4. Every user is logged out (good) and forced to log in again (fine)

No data is lost — accounts, licenses, payment history all live in Redis
keyed by email, untouched by SESSION_SECRET rotation.

---

## 8. The exact-amount guarantee — "exactly 24.99 or no licence"

The on-chain verifier in `api/_lib/solana-pay.ts::verifyTokenTransfer`
implements three hard gates per transaction it scans:

```ts
// 1. Recipient must match — the buyer paid OUR wallet, not someone else's
const postEntry = post.find(b =>
  b.owner === expected.recipient && b.mint === expected.mint
);
if (!postEntry) return false;        // wrong wallet → reject

// 2. Token mint must match — USDC stays USDC, SOL stays SOL
//    (the second `expected.mint === b.mint` clause)

// 3. Amount must satisfy the floor with 1% tolerance for wallet rounding
const delta = postAmount - preAmount;
return delta >= expected.minAmount * 0.99;
```

**What this means concretely for a $24.99 Pro intent**:

| User pays | Verifier verdict | Why |
|---|---|---|
| $24.99 | ✅ accepted | exact match |
| $25.00 | ✅ accepted | overpayment counts as paid |
| $24.74 | ❌ rejected | below $24.7401 floor (1% tolerance) |
| $20.00 | ❌ rejected | underpayment |
| $24.99 to wrong wallet | ❌ rejected | recipient mismatch |
| $24.99 in SOL on a USDC intent | ❌ rejected | mint mismatch |
| $24.99 with a tx that errored | ❌ rejected | `tx.meta.err` non-null |

**Why 1% tolerance and not exact-match**: wallet UIs often display
"24.99" but transmit `24.989999` due to decimal precision in the
underlying SPL token (USDC has 6 decimals on Solana). A strict equality
check would reject those payments and infuriate users. 1% (~$0.25 of
slack on a $24.99 intent) covers wallet rounding without admitting any
realistic underpayment.

**Brute force isn't possible**: every payment intent generates a fresh
32-byte random `reference` address. Without that exact reference in
the transaction's account list, our scanner doesn't even consider the
tx — it filters by reference first, validates amount second.

---

## 9. The "connect wallet" UX in pricing.html

The modal detects three browser-extension wallets:

```js
window.solana.isPhantom   → "Pay with Phantom"
window.solflare.isSolflare → "Pay with Solflare"
window.backpack.isBackpack → "Pay with Backpack"
```

Click handler is a single line:

```js
window.location.href = intent.payUrl;
// e.g. solana:41gURUf55…?amount=24.99&spl-token=EPjFW…&reference=…
```

Every Solana wallet extension intercepts `solana:` URL navigation and
opens its signing dialog with recipient + amount + reference + memo
all pre-filled. The user just clicks **Approve**. No `@solana/wallet-
adapter` import, no `@solana/web3.js` — zero added JS payload.

For users without a browser extension wallet, the modal falls back to:
- **QR code** (mobile wallets scan it)
- **"Open in wallet →" deep link** (system handler picks any installed
  Solana wallet)

---

*Last updated: 2026-05-03. Current state: SESSION_SECRET pending. Once
set, the full pipeline is production-ready.*
