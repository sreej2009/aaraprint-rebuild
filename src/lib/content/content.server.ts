/// <reference types="node" />
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ContentPage, CreditEntry, FaqEntry } from './types';

const ROOT = path.resolve('src/data/generated/content');

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(ROOT, file), 'utf8')) as T;
}

export const CONTENT_PAGES = ['about', 'shipping', 'refund-policy', 'privacy', 'terms'] as const;
export type ContentSlug = (typeof CONTENT_PAGES)[number];

export const getContentPage = (slug: ContentSlug) => readJson<ContentPage>(`${slug}.json`);
export const getFaq = () => readJson<FaqEntry[]>('faq.json');
export const getCredits = () => readJson<CreditEntry[]>('credits.json');
