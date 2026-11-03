#!/usr/bin/env node
/**
 * Serve the production build (build/client) with the same rules a static host must use:
 *
 *   1. /media/<ref>        -> product media from the recovered asset folders (a CDN in production)
 *   2. an existing file     -> that file (hashed /assets/* are cached for a year)
 *   3. <path>/index.html    -> pre-rendered page
 *   4. anything else        -> __spa-fallback.html (client-rendered routes such as /cart)
 *
 * `vite preview` cannot be used: it answers every path with the pre-rendered home page.
 * Usage: node scripts/serve-build.mjs [--port 4173] [--dir build/client]
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { resolveMediaFile } from '../tooling/local-media.ts';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((arg, i, all) => (arg.startsWith('--') ? [arg.slice(2), all[i + 1] ?? 'true'] : null))
    .filter(Boolean),
);
const PORT = Number(args.port ?? process.env.PORT ?? 4173);
const ROOT = path.resolve(String(args.dir ?? 'build/client'));
const MEDIA_ROOTS = (process.env.AARAPRINT_MEDIA_ROOTS?.split(path.delimiter) ?? ['../recovered-additional', '../recovered']).map((r) => path.resolve(r));
const FALLBACK = ['__spa-fallback.html', 'index.html'].map((f) => path.join(ROOT, f)).find((f) => fs.existsSync(f));

if (!fs.existsSync(ROOT) || !FALLBACK) {
  console.error(`No build found in ${ROOT}. Run "npm run build" first.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.data': 'text/x-script; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.txt': 'text/plain; charset=utf-8',
};

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function send(res, req, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const immutable = file.startsWith(path.join(ROOT, 'assets') + path.sep);
  res.writeHead(status, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': fs.statSync(file).size,
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname.startsWith('/media/')) {
    const file = resolveMediaFile(pathname.slice('/media/'.length), MEDIA_ROOTS);
    if (file) return send(res, req, file);
    res.writeHead(404).end('Not found');
    return;
  }

  const target = path.resolve(ROOT, `.${pathname}`);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(400).end('Bad request');
    return;
  }
  if (isFile(target)) return send(res, req, target);
  const page = path.join(target, 'index.html');
  if (isFile(page)) return send(res, req, page);
  if (path.extname(pathname)) {
    res.writeHead(404).end('Not found');
    return;
  }
  send(res, req, FALLBACK);
});

server.listen(PORT, () => {
  console.log(`Serving ${path.relative(process.cwd(), ROOT)} at http://localhost:${PORT}`);
});
