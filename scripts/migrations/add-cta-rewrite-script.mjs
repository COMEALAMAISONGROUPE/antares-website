// One-shot — add <script src="/js/mobile-cta-rewrite.js" defer> after
// the existing mobile-fixes.css link on every page that has it,
// EXCEPT install.html (the script skips itself when on /install,
// but we still don't want the request, and there's no Install CTA
// to rewrite there).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPT_TAG = '<script src="/js/mobile-cta-rewrite.js" defer></script>';
const SKIP = new Set(['install.html', 'og-generator.html']);

const files = (await readdir(ROOT)).filter(f => f.endsWith('.html') && !SKIP.has(f));
let added = 0, skipped = 0;
for (const f of files) {
  const src = await readFile(join(ROOT, f), 'utf8');
  if (!src.includes('/css/mobile-fixes.css')) {
    console.log(`-  ${f}: no mobile-fixes.css link, skipping`);
    skipped++;
    continue;
  }
  if (src.includes('/js/mobile-cta-rewrite.js')) {
    console.log(`-  ${f}: already references the script`);
    skipped++;
    continue;
  }
  // Insert the script tag immediately after the mobile-fixes.css <link>.
  const next = src.replace(
    /(<link rel="stylesheet" href="\/css\/mobile-fixes\.css">)/,
    '$1\n' + SCRIPT_TAG
  );
  if (next === src) { console.log(`!  ${f}: anchor not matched`); continue; }
  await writeFile(join(ROOT, f), next);
  console.log(`✓  ${f}`);
  added++;
}
console.log(`\nAdded script to ${added} files, skipped ${skipped}.`);
