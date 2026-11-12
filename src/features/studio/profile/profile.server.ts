/// <reference types="node" />
import fs from 'node:fs/promises';
import path from 'node:path';
import type { StudioProfile } from './types';

/**
 * Build-time (pre-render) access to Studio profiles, for route loaders outside the Studio (the
 * product page needs a product's print surfaces to hold its design draft, Phase 4 M2). The
 * browser uses the same JSON through profile/api.ts. `.server` modules never reach the client.
 */
const ROOT = path.resolve('public/api/v1/studio');

export async function getStudioProfile(slug: string): Promise<StudioProfile | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(ROOT, `${slug}.json`), 'utf8')) as StudioProfile;
  } catch {
    return null;
  }
}
