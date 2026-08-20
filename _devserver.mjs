#!/usr/bin/env node
/*
 * Local dev server (JS / Node) — mirrors the production clean-URL rules.
 * ---------------------------------------------------------------------
 * `python -m http.server` (and any plain static server) only serves paths that
 * map to a real file, so pretty routes like /bitcoin-puzzle/71/random or the
 * virtual /bitcoin-dormant/50 fail during LOCAL preview. This replays the same
 * rewrite rules the site's .htaccess (cPanel) and 404.html router (GitHub Pages)
 * use, so `node _devserver.mjs` previews the site exactly like the live host.
 *
 * IMPORTANT: this is a LOCAL PREVIEW TOOL ONLY. Nothing server-side (Node OR
 * Python) runs on the deployed static site. On the live site the SAME clean-URL
 * behavior is provided entirely by BROWSER JavaScript that already ships:
 *     - assets/js/clean-urls.js  (keeps the address bar pretty)
 *     - 404.html                 (client-side router for the virtual routes)
 * So you never deploy this file; it just makes your local machine behave like
 * GitHub Pages / cPanel.
 *
 *     node _devserver.mjs           # serves this folder on 127.0.0.1:8000
 *     node _devserver.mjs 8080      # custom port
 */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json',
};

const abs = (rel) => path.join(ROOT, rel.replace(/\//g, path.sep));
const isFile = (rel) => { try { return statSync(abs(rel)).isFile(); } catch { return false; } };
const isDir = (rel) => { try { return statSync(abs(rel)).isDirectory(); } catch { return false; } };

// URL path (decoded, no query) -> on-disk relative path, or null (404).
function resolvePath(p) {
  p = p.replace(/^\/+|\/+$/g, '');
  if (p === '') return isFile('index.html') ? 'index.html' : null;
  if (isFile(p)) return p;                                    // real file
  if (isDir(p) && isFile(p + '/index.html')) return p + '/index.html';

  // 1) generic "serve .html without extension" (/foo/bar -> /foo/bar.html)
  if (isFile(p + '.html')) return p + '.html';

  let m;
  // 2) /key/<value> -> key.html
  if (/^key\/[^/]+$/.test(p) && isFile('key.html')) return 'key.html';
  // 3) /brainwallet/<chain>/<n> -> /brainwallet/<chain>/2.html
  if ((m = p.match(/^brainwallet\/([a-z0-9-]+)\/([0-9]+)$/)) && isFile(`brainwallet/${m[1]}/2.html`)) return `brainwallet/${m[1]}/2.html`;
  // 4) /brainwallet/<n> -> /brainwallet/bitcoin/<n>.html
  if ((m = p.match(/^brainwallet\/([0-9]+)$/)) && isFile(`brainwallet/bitcoin/${m[1]}.html`)) return `brainwallet/bitcoin/${m[1]}.html`;
  // 5) /bitcoin-dormant/address/<addr> -> /bitcoin-dormant/address.html
  if (/^bitcoin-dormant\/address\/[^/]+$/.test(p) && isFile('bitcoin-dormant/address.html')) return 'bitcoin-dormant/address.html';
  // 6) /bitcoin-dormant/<n> -> /bitcoin-dormant/_page.html
  if (/^bitcoin-dormant\/[0-9]+$/.test(p) && isFile('bitcoin-dormant/_page.html')) return 'bitcoin-dormant/_page.html';
  // 7) /<a>/<b> -> /<a>/<b>.html   (e.g. /private-keys/bitcoin)
  if ((m = p.match(/^([a-z0-9-]+)\/([a-z0-9-]+)$/)) && isFile(`${m[1]}/${m[2]}.html`)) return `${m[1]}/${m[2]}.html`;
  // 8) /<a>/<n> -> /<a>/<n>.html   (e.g. /bitcoin-puzzle/42)
  if ((m = p.match(/^([a-z0-9-]+)\/([0-9]+)$/)) && isFile(`${m[1]}/${m[2]}.html`)) return `${m[1]}/${m[2]}.html`;
  // 9) /milk-sad/<chain>/<n> -> /milk-sad/<chain>/1.html
  if ((m = p.match(/^milk-sad\/([a-z0-9-]+)\/([0-9]+)$/)) && isFile(`milk-sad/${m[1]}/1.html`)) return `milk-sad/${m[1]}/1.html`;

  return null;
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://127.0.0.1');
    const decoded = decodeURIComponent(u.pathname);
    let target = resolvePath(decoded);
    let status = 200;
    if (!target) { target = isFile('index.html') ? 'index.html' : null; status = 404; } // ErrorDocument fallback
    if (!target) { res.writeHead(404); res.end('Not found'); return; }
    const data = await readFile(abs(target));
    const ext = path.extname(target).toLowerCase();
    res.writeHead(status, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(data);
  } catch {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Clean-URL dev server (JS/Node, mirrors .htaccess) -> http://127.0.0.1:${PORT}/`);
  console.log(`Try: http://127.0.0.1:${PORT}/bitcoin-puzzle/71/random`);
  console.log('NOTE: local preview only — the live site needs no server (browser JS handles clean URLs).');
});
