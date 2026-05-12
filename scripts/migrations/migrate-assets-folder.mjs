// One-shot — move favicon.png, icon.png, og-image.png, og-image.svg
// from repo root into /assets/ and rewrite every reference to point
// at the new path.
//
// Rewrites it touches:
//   *.html (root)                  — href / src / url() / og:image meta
//   manifest.json                  — icons[].src
//   vercel.json                    — header source rule (now under /assets/*)
//                                    + adds redirects 301 from old paths so
//                                    the existing OG-share crawler cache
//                                    (twitter / discord / etc) keeps resolving
//   css/mobile-fixes.css           — url('/icon.png') x2
//
// What stays at the root: nothing image-related. The 4 PNG/SVG files
// physically move into assets/ via git mv (preserves history).
//
// Idempotent: rerunning after the migration completes is a no-op.

import { readdir, readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const ASSETS_DIR = join(ROOT, 'assets');

const IMAGES = ['favicon.png', 'icon.png', 'og-image.png', 'og-image.svg'];

async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

/* ── 1. ensure /assets/ exists and physically move the 4 files ───── */
await mkdir(ASSETS_DIR, { recursive: true });
for (const img of IMAGES) {
  const from = join(ROOT, img);
  const to = join(ASSETS_DIR, img);
  if (await exists(to)) {
    console.log(`-- ${img} already in assets/`);
    continue;
  }
  if (!(await exists(from))) {
    console.log(`!! ${img} missing from root (already migrated?)`);
    continue;
  }
  await rename(from, to);
  console.log(`✓  moved ${img} -> assets/${img}`);
}

/* ── 2. rewrite every reference in HTML + CSS + JSON ────────────── */
const REPLACEMENTS = [
  // HTML attributes — quoted relative path at root
  [/href="favicon\.png"/g, 'href="/assets/favicon.png"'],
  [/src="favicon\.png"/g, 'src="/assets/favicon.png"'],
  [/href="icon\.png"/g, 'href="/assets/icon.png"'],
  [/src="icon\.png"/g, 'src="/assets/icon.png"'],
  [/href="og-image\.png"/g, 'href="/assets/og-image.png"'],
  [/src="og-image\.png"/g, 'src="/assets/og-image.png"'],
  [/href="og-image\.svg"/g, 'href="/assets/og-image.svg"'],
  [/src="og-image\.svg"/g, 'src="/assets/og-image.svg"'],

  // CSS url() — covers all 8 variants: with/without quotes (none, ', "),
  // and relative or absolute root path. Match group keeps the
  // image filename + extension so one rule fits all 4 images.
  [/url\((['"]?)(?:\/)?(favicon|icon|og-image)\.(png|svg)\1\)/g,
    (_m, q, name, ext) => `url(${q || "'"}/assets/${name}.${ext}${q || "'"})`],

  // Absolute prod URLs in og:image / twitter:image / canonical
  [/https:\/\/antaresscan\.com\/og-image\.png/g, 'https://antaresscan.com/assets/og-image.png'],
  [/https:\/\/antaresscan\.com\/og-image\.svg/g, 'https://antaresscan.com/assets/og-image.svg'],
  [/https:\/\/antaresscan\.com\/favicon\.png/g, 'https://antaresscan.com/assets/favicon.png'],
  [/https:\/\/antaresscan\.com\/icon\.png/g, 'https://antaresscan.com/assets/icon.png'],

  // manifest.json icons[].src (already absolute)
  [/"src":\s*"\/favicon\.png"/g, '"src": "/assets/favicon.png"'],
  [/"src":\s*"\/icon\.png"/g, '"src": "/assets/icon.png"'],
];

/* Files to sweep — HTML at root + the 3 known config/CSS hosts. */
const rootFiles = (await readdir(ROOT)).filter(f => f.endsWith('.html'));
const targets = [
  ...rootFiles.map(f => join(ROOT, f)),
  join(ROOT, 'manifest.json'),
  join(ROOT, 'css', 'mobile-fixes.css'),
];

let changed = 0;
for (const path of targets) {
  if (!(await exists(path))) continue;
  let src = await readFile(path, 'utf8');
  const before = src;
  for (const [pat, repl] of REPLACEMENTS) src = src.replace(pat, repl);
  if (src !== before) {
    await writeFile(path, src);
    const rel = path.replace(ROOT + '\\', '').replace(ROOT + '/', '');
    console.log(`✓  rewrote ${rel}`);
    changed++;
  }
}
console.log(`\n${changed} files updated.`);

/* ── 3. vercel.json — surgical: update the cache header source and
        add 301 redirects from the old paths so external OG crawlers
        that have the old URL in cache keep resolving. */
const vjPath = join(ROOT, 'vercel.json');
const vj = JSON.parse(await readFile(vjPath, 'utf8'));

// 3a. Update the existing /favicon.png cache header to /assets/favicon.png.
//     The header itself stays (we still want long cache on the icon).
for (const block of vj.headers || []) {
  if (block.source === '/favicon.png') {
    block.source = '/assets/favicon.png';
    console.log(`✓  vercel.json: cache header /favicon.png -> /assets/favicon.png`);
  }
}

// 3b. Add a cache header for the whole /assets/ folder (long, immutable).
const hasAssetsCache = (vj.headers || []).some(h => h.source === '/assets/(.*)');
if (!hasAssetsCache) {
  vj.headers.push({
    source: '/assets/(.*)',
    headers: [
      { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
    ],
  });
  console.log(`✓  vercel.json: added cache header for /assets/(.*)`);
}

// 3c. Add 301 redirects from old root paths to new /assets paths so
//     the existing OG share cache (twitter/discord/slack/etc) and any
//     hardcoded external link keeps resolving.
const redirectsToAdd = IMAGES.map(name => ({
  source: `/${name}`,
  destination: `/assets/${name}`,
  permanent: true,
}));
vj.redirects = vj.redirects || [];
for (const r of redirectsToAdd) {
  const already = vj.redirects.some(x => x.source === r.source && x.destination === r.destination);
  if (!already) {
    vj.redirects.push(r);
    console.log(`✓  vercel.json: redirect ${r.source} -> ${r.destination}`);
  }
}

await writeFile(vjPath, JSON.stringify(vj, null, 2) + '\n');
console.log('✓  vercel.json saved');
