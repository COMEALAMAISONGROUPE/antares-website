// One-shot — adds <link rel="stylesheet" href="/css/mobile-fixes.css">
// before </head> on every HTML page that doesn't already reference it.
// Skips og-generator.html (internal tool, not public).

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();
const LINK = '<link rel="stylesheet" href="/css/mobile-fixes.css">';
const SKIP = new Set(['og-generator.html']);

const files = (await readdir(ROOT)).filter(f => f.endsWith('.html') && !SKIP.has(f));
let added = 0, skipped = 0;
for (const f of files) {
  const src = await readFile(join(ROOT, f), 'utf8');
  if (src.includes('/css/mobile-fixes.css')) { skipped++; continue; }
  const next = src.replace(/(\n?)<\/head>/, `\n${LINK}\n</head>`);
  if (next === src) { console.log(`!  ${f}: no </head> tag matched`); continue; }
  await writeFile(join(ROOT, f), next);
  console.log(`✓  ${f}`); added++;
}
console.log(`\nAdded link to ${added} files, skipped ${skipped} already-linked, ${files.length} total.`);
