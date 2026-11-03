import navigation from '@/data/generated/navigation.json';
import type { CategorySummary } from './types';

/** The 11 shop categories, bundled into the app shell (header, footer, home). */
export const categories: readonly CategorySummary[] = navigation;

export function categoryHref(slug: string): string {
  return `/categories/${slug}`;
}
