#!/usr/bin/env node
/**
 * Arrange a base-path build for GitHub Pages (the public preview at
 * https://sreej2009.github.io/aaraprint-rebuild/).
 *
 * Built with PAGES_BASE=/aaraprint-rebuild/, React Router writes the pre-rendered pages under
 * build/client/aaraprint-rebuild/ and the SPA fallback as build/client/index.html. GitHub Pages
 * already serves the repository at /aaraprint-rebuild/, so the artefact (build/pages) gets:
 *   - static files (assets, api, brand, icons) at its root;
 *   - the pre-rendered pages at its root;
 *   - the SPA fallback as 404.html, which Pages serves for every other path (Studio, search…);
 *   - .nojekyll, so files starting with "_" are served.
 *
 * Usage: node scripts/pages/prepare-pages.mjs [--base aaraprint-rebuild]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const base = (process.argv.includes('--base') ? process.argv[process.argv.indexOf('--base') + 1] : 'aaraprint-rebuild').replace(/^\/+|\/+$/g, '');
const client = path.join(ROOT, 'build', 'client');
const out = path.join(ROOT, 'build', 'pages');
const prerendered = path.join(client, base);

await fs.access(path.join(prerendered, 'index.html')).catch(() => {
  console.error(`No pre-rendered pages in build/client/${base}/. Build with PAGES_BASE=/${base}/ first.`);
  process.exit(1);
});

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const entry of await fs.readdir(client)) {
  if (entry === base || entry === 'index.html') continue;
  await fs.cp(path.join(client, entry), path.join(out, entry), { recursive: true });
}
await fs.cp(prerendered, out, { recursive: true });
await fs.copyFile(path.join(client, 'index.html'), path.join(out, '404.html'));
await fs.writeFile(path.join(out, '.nojekyll'), '');

const count = async (dir) => (await fs.readdir(dir, { recursive: true })).filter((f) => f.endsWith('index.html')).length;
console.log(`GitHub Pages site ready in build/pages: ${await count(out)} pages, SPA fallback as 404.html.`);
