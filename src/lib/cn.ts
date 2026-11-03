import { extendTailwindMerge, type ClassNameValue } from 'tailwind-merge';

/**
 * tailwind-merge must know our custom scales, otherwise it treats `text-body`
 * as a colour and drops it when merged with `text-fg` (and similar for shadows).
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'body-sm', 'body', 'lead', 'h3', 'h2', 'h1', 'display'],
      shadow: ['1', '2', '3'],
      radius: ['sm', 'md', 'lg'],
      container: ['page', 'reading'],
    },
  },
});

/** Join class names, letting later Tailwind classes override earlier conflicting ones. */
export function cn(...inputs: ClassNameValue[]): string {
  return twMerge(...inputs);
}
