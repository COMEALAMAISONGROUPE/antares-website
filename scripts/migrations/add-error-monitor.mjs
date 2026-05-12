#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/migrations/add-error-monitor.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — adds <script src="/js/error-monitor.js"></script> to
   every public page. NO defer attribute: we want this to run before
   any other JS so it can catch errors in those scripts too.

   Inserts as the FIRST line of <head> (right after the opening
   <head> tag), so it has the highest priority load order.

   Idempotent: skips pages that already have it.
   ────────────────────────────────────────────────────────────────── */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const TAG = '<script src="/js/error-monitor.js"></script>';
// Accept either "<head>\n" (typical) or "<head><meta…>" inline
// (token.html). We capture whatever the first character after
// <head> is — either a newline or the next tag — so we keep it.
const ANCHOR_RE = /<head>(\r?\n|)/;

const entries = await readdir(cwd(), { withFileTypes: true });
const PAGES = entries
  .filter(e => e.isFile() && e.name.endsWith('.html'))
  .map(e => e.name)
  .sort();

let touched = 0, skipped = 0, errored = 0;

for (const file of PAGES) {
  const path = join(cwd(), file);
  let src;
  try {
    src = await readFile(path, 'utf8');
  } catch (e) {
    console.error(`SKIP ${file}: ${e.message}`);
    errored++;
    continue;
  }

  if (src.includes(TAG)) {
    console.log(`-- ${file} (already has error-monitor)`);
    skipped++;
    continue;
  }

  if (!ANCHOR_RE.test(src)) {
    console.error(`SKIP ${file}: no <head>\\n found`);
    errored++;
    continue;
  }

  const next = src.replace(ANCHOR_RE, (m, eol) => `<head>${eol}${TAG}${eol}`);
  await writeFile(path, next);
  console.log(`✓  ${file}`);
  touched++;
}

console.log('');
console.log(`Done. Touched: ${touched}  Skipped: ${skipped}  Errored: ${errored}`);
exit(errored === 0 ? 0 : 1);
