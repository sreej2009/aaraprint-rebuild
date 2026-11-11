import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';
import { FIXTURE_PREFIX, productViewFixture } from './product-view-fixtures.ts';

/**
 * Serves product media in development and `vite preview` from the recovered asset folders,
 * so the app can reference media without copying hundreds of megabytes into `public/`.
 *
 *   GET /media/<ref>  ->  <root>/<ref>, trying each root in order
 *
 * Production serves the same refs from object storage / a CDN (`VITE_MEDIA_BASE_URL`).
 * Roots default to ../recovered-additional then ../recovered and can be overridden with
 * AARAPRINT_MEDIA_ROOTS (path-delimiter separated).
 *
 * In development only (`configureServer`, not `vite preview`), /media/dev-fixtures/product-view/…
 * serves generated stand-in product photos for the Studio's product view (product-view-fixtures.ts).
 */
export function localMedia(options: { base?: string; roots?: string[] } = {}): Plugin {
  const base = options.base ?? '/media/';
  const roots = (options.roots ?? process.env.AARAPRINT_MEDIA_ROOTS?.split(path.delimiter) ?? ['../recovered-additional', '../recovered'])
    .filter(Boolean)
    .map((root) => path.resolve(root));

  const studioDir = path.resolve('public/api/v1/studio');
  const handler = (fixtures: boolean): Connect.NextHandleFunction => (req, res, next) => {
    if (!req.url?.startsWith(base) || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
    let ref: string;
    try {
      ref = decodeURIComponent(req.url.slice(base.length).split('?')[0] ?? '');
    } catch {
      res.statusCode = 400;
      res.end('Bad request');
      return;
    }
    if (ref.startsWith(FIXTURE_PREFIX)) {
      const stand = fixtures ? productViewFixture(ref, studioDir) : null;
      if (!stand) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(stand.length));
      res.setHeader('Cache-Control', 'no-store');
      res.end(req.method === 'HEAD' ? undefined : stand);
      return;
    }
    const file = resolveMediaFile(ref, roots);
    if (!file) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    res.setHeader('Content-Type', CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(fs.statSync(file).size));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'aaraprint:local-media',
    configureServer(server) {
      server.middlewares.use(handler(true));
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler(false));
    },
  };
}

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

/**
 * Where a media ref may live inside a root. The first crawl stored `/products/<folder>/…`
 * as `<folder>/…` and `/products/polo/…` as `apparel-polo/…`; recovered-additional mirrors URLs.
 */
export function mediaCandidates(ref: string): string[] {
  const clean = path.posix.normalize(ref.replace(/\\/g, '/')).replace(/^\/+/, '');
  if (clean.startsWith('..') || clean === '.') return [];
  const candidates = [clean];
  if (clean.startsWith('products/polo/')) candidates.push(`apparel-polo/${clean.slice('products/polo/'.length)}`);
  else if (clean.startsWith('products/')) candidates.push(clean.slice('products/'.length));
  return candidates;
}

export function resolveMediaFile(ref: string, roots: string[]): string | null {
  for (const root of roots) {
    for (const candidate of mediaCandidates(ref)) {
      const full = path.resolve(root, candidate);
      if (!full.startsWith(root + path.sep)) continue; // never escape the root
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* try the next candidate */
      }
    }
  }
  return null;
}
