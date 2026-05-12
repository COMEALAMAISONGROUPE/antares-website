#!/usr/bin/env node
/* Local static server that mimics Vercel's cleanUrls + the catch-all
   security headers from vercel.json. Use it to preview the site
   locally with the same routing + CSP as production.

   Usage:
     node scripts/serve.mjs           # picks port 4173
     PORT=8080 node scripts/serve.mjs # explicit port

   Why this exists (and not just `python -m http.server`):
     - `cleanUrls: true` rewrites /pricing -> /pricing.html. Plain
       static servers 404 on /pricing.
     - The audit's CSP enforcement is wired the same way (read
       vercel.json, apply the catch-all headers). Previewing with
       the same headers catches a class of CSP bugs that wouldn't
       show up otherwise. */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { normalize, resolve, join } from 'node:path';
import { cwd, env, exit } from 'node:process';

const ROOT = cwd();
const PORT = Number(env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};
function ext(p) { const i = p.lastIndexOf('.'); return i < 0 ? '' : p.slice(i).toLowerCase(); }

async function resolveFile(urlPath) {
  const safe = normalize(urlPath.replace(/^\/+/, '')).replace(/\\/g, '/');
  const tries = [];
  if (urlPath === '/' || urlPath === '') tries.push('index.html');
  else {
    tries.push(safe);
    if (!ext(safe)) tries.push(safe + '.html');
    tries.push(join(safe, 'index.html'));
  }
  for (const t of tries) {
    const full = resolve(ROOT, t);
    if (!full.startsWith(resolve(ROOT))) continue;
    try { if ((await stat(full)).isFile()) return full; } catch { /* try next */ }
  }
  return null;
}

async function loadVercelHeaders() {
  try {
    const vj = JSON.parse(await readFile(resolve(ROOT, 'vercel.json'), 'utf8'));
    const block = (vj.headers || []).find(h => h.source === '/(.*)');
    if (!block) return {};
    const out = {};
    for (const h of block.headers) out[h.key] = h.value;
    return out;
  } catch { return {}; }
}
const vercelHeaders = await loadVercelHeaders();

const server = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const f = await resolveFile(decodeURIComponent(u.pathname));
  if (!f) { res.statusCode = 404; res.end('404'); return; }
  res.setHeader('content-type', MIME[ext(f)] || 'application/octet-stream');
  for (const [k, v] of Object.entries(vercelHeaders)) res.setHeader(k, v);
  res.end(await readFile(f));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Antares static preview on http://127.0.0.1:${PORT}`);
  console.log('cleanUrls + vercel.json catch-all headers applied.');
  console.log('Ctrl-C to stop.');
});

process.on('SIGINT', () => { server.close(() => exit(0)); });
