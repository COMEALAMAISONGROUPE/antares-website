#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────
   scripts/download-fonts.mjs
   ──────────────────────────────────────────────────────────────────
   One-shot — pulls down the latin-range WOFF2 files for the two
   fonts the site uses (Bebas Neue 400 + IBM Plex Mono 400/600/700)
   and writes them to fonts/. Then prints the @font-face block we
   should paste into css/base.css with relative URLs.

   Why this exists:
     The marketing site loaded fonts via Google Fonts, which is
     render-blocking, leaks viewer fingerprints to Google, and
     requires three DNS lookups (googleapis.com, gstatic.com).
     Self-hosting cuts FCP by ~150-200ms on slow connections and
     keeps the font URL stable forever.

   Why only the latin range:
     The site copy is English (with the occasional en/em-dash and
     trademark symbol). All in U+0000-00FF + U+2000-206F. The
     cyrillic, vietnamese, latin-ext .woff2 files Google ships
     never get downloaded anyway since no glyph in those ranges
     appears on the page.

   Usage:
     node scripts/download-fonts.mjs
   ────────────────────────────────────────────────────────────────── */
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd, exit } from 'node:process';

const CSS_URL = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@400;600;700&display=swap';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

// Pull the CSS file in WOFF2-serving mode.
console.log('Fetching Google Fonts CSS...');
const css = await (await fetch(CSS_URL, { headers: { 'User-Agent': UA } })).text();

// Parse each @font-face block. We want only blocks tagged as latin
// (i.e. the previous comment line is `/* latin */`, not latin-ext /
// cyrillic / vietnamese / etc.).
const blocks = [];
const re = /\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g;
let m;
while ((m = re.exec(css)) !== null) {
  blocks.push({ range: m[1], faceCss: m[2] });
}

const latinBlocks = blocks.filter(b => b.range === 'latin');
console.log(`Found ${blocks.length} @font-face blocks, keeping ${latinBlocks.length} latin ones.`);

// For each latin block, extract URL + family + weight, name the file
// deterministically, download it, rewrite the @font-face to point
// at the local path.
await mkdir(join(cwd(), 'fonts'), { recursive: true });

const outFaces = [];
for (const { faceCss } of latinBlocks) {
  const family = /font-family:\s*'([^']+)'/.exec(faceCss)?.[1];
  const weight = /font-weight:\s*(\d+)/.exec(faceCss)?.[1] ?? '400';
  const url = /url\(([^)]+)\)/.exec(faceCss)?.[1];
  if (!family || !url) continue;

  const slug = family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `${slug}-${weight}.woff2`;
  const filepath = join(cwd(), 'fonts', filename);

  console.log(`Downloading ${family} ${weight} -> fonts/${filename}`);
  const fontResp = await fetch(url, { headers: { 'User-Agent': UA } });
  const buf = Buffer.from(await fontResp.arrayBuffer());
  await writeFile(filepath, buf);
  console.log(`  saved ${buf.length} bytes`);

  // Rewrite the @font-face: keep everything except the URL and the
  // `format('woff2')` annotation (still applies), and append a
  // unicode-range so the font is only matched against latin chars.
  outFaces.push(
    faceCss
      .replace(url, `/fonts/${filename}`)
      .trim()
      .replace(/\}$/, `  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+2000-206F, U+2113, U+2122;\n}`)
  );
}

console.log('');
console.log('--- Paste this block into css/base.css ---');
console.log(outFaces.join('\n\n'));
console.log('--- End ---');
exit(0);
