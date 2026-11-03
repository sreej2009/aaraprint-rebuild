import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '@/lib/contrast';
import { colorTokens, contrastRequirements } from './tokens';

const themeCss = fs.readFileSync(path.resolve('src/styles/theme.css'), 'utf8');
const cssColors = Object.fromEntries([...themeCss.matchAll(/--color-([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]!.toLowerCase()]));

describe('colour tokens', () => {
  it('mirror src/styles/theme.css exactly', () => {
    for (const [name, hex] of Object.entries(colorTokens)) {
      expect(cssColors[name], `--color-${name}`).toBe(hex);
    }
  });

  it.each(contrastRequirements)('$foreground on $background meets $minimum:1 ($usage)', ({ foreground, background, minimum }) => {
    expect(contrastRatio(colorTokens[foreground], colorTokens[background])).toBeGreaterThanOrEqual(minimum);
  });
});

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});
