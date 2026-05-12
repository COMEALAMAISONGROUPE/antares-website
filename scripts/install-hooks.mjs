#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/install-hooks.mjs
   ──────────────────────────────────────────────────────────────────
   Installs a git pre-commit hook that runs `npm run lint` before
   every commit. The hook is a portable POSIX shell script so it
   works on Windows (msysgit), macOS, and Linux.

   Usage:
     npm run hooks:install

   What the hook does:
     - On every `git commit`, runs `npm run lint`.
     - If lint fails, the commit is aborted with a non-zero exit.
     - `git commit --no-verify` bypasses it for emergencies.

   Why we don't auto-install via "prepare" lifecycle script:
     Running on every `npm install` annoys CI. The hook is per-clone
     opt-in, the README documents it.

   Why we don't run the full audit in pre-commit:
     `npm test` takes 1-2 minutes. Running it on every commit is
     brutal. The audit gates merges via CI; lint catches the cheap
     stuff at commit time.
   ────────────────────────────────────────────────────────────────── */
import { writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

const repoRoot = cwd();
const gitDir = resolve(repoRoot, '.git');

if (!existsSync(gitDir)) {
  console.error('Error: .git directory not found. Run this from the repo root after `git clone`.');
  exit(1);
}

const hooksDir = join(gitDir, 'hooks');
await mkdir(hooksDir, { recursive: true });

const hookPath = join(hooksDir, 'pre-commit');
const hookBody = `#!/bin/sh
# Antares pre-commit hook — runs lint before allowing commit.
# Installed by: npm run hooks:install
# Bypass for emergencies: git commit --no-verify

set -e

# Skip if no staged changes (rare but happens on rebases).
if git diff --cached --quiet; then
  exit 0
fi

echo "→ Running npm run lint..."
npm run lint

# Lint passed. Audit runs in CI on every PR; we don't run it here
# because it takes 1-2 minutes per commit.
`;

await writeFile(hookPath, hookBody);
try { await chmod(hookPath, 0o755); } catch { /* Windows ignores chmod */ }

console.log(`✓ Installed pre-commit hook at ${hookPath}`);
console.log('  Bypass with: git commit --no-verify');
exit(0);
