/// <reference types="node" />
import fs from 'node:fs';
import path from 'node:path';
import type { Product } from '@/lib/catalogue/types';
import type { StudioProfile } from '../profile/types';

/** Real product and Studio profile JSON from the mock API, for component and route tests. */
export function readProduct(slug: string): Product {
  return JSON.parse(fs.readFileSync(path.resolve('public/api/v1/catalogue/products', `${slug}.json`), 'utf8')) as Product;
}

export function readProfile(slug: string): StudioProfile {
  return JSON.parse(fs.readFileSync(path.resolve('public/api/v1/studio', `${slug}.json`), 'utf8')) as StudioProfile;
}
