#!/usr/bin/env node
/**
 * Serve build/pages the way GitHub Pages does, for checking the preview locally:
 * under /aaraprint-rebuild/, directories serve their index.html, and unknown paths get 404.html
 * (with a 404 status, as Pages does).
 *
 * Usage: node scripts/pages/serve-pages.mjs [--port 4174]
 */
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const port = Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4174);
const root = path.join(process.cwd(), 'build', 'pages');
const prefix = '/aaraprint-rebuild';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.data': 'text/x-script' };

async function file(p) {
  try {
    const stat = await fs.stat(p);
    if (stat.isDirectory()) return file(path.join(p, 'index.html'));
    return p;
  } catch {
    return null;
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith(prefix)) {
      res.writeHead(302, { location: `${prefix}/` }).end();
      return;
    }
    const rel = decodeURIComponent(url.pathname.slice(prefix.length)) || '/';
    const found = await file(path.join(root, rel));
    const target = found ?? path.join(root, '404.html');
    res.writeHead(found ? 200 : 404, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream' });
    res.end(await fs.readFile(target));
  })
  .listen(port, () => console.log(`GitHub Pages preview: http://localhost:${port}${prefix}/`));
