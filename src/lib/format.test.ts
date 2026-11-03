import { describe, expect, it } from 'vitest';
import { formatCount, formatINR, formatPriceDelta, pluralize, savingsPercent } from './format';

describe('formatINR', () => {
  it('drops paise for whole rupees', () => {
    expect(formatINR(22900)).toBe('₹229');
    expect(formatINR(199900)).toBe('₹1,999');
  });

  it('keeps two decimals for fractional amounts', () => {
    expect(formatINR(229)).toBe('₹2.29');
    expect(formatINR(152)).toBe('₹1.52');
  });

  it('uses Indian digit grouping', () => {
    expect(formatINR(1_00_00_000)).toBe('₹1,00,000');
  });
});

describe('formatPriceDelta', () => {
  it('signs non-zero deltas and hides zero', () => {
    expect(formatPriceDelta(15000)).toBe('+₹150');
    expect(formatPriceDelta(-2000)).toBe('−₹20');
    expect(formatPriceDelta(0)).toBe('');
  });
});

describe('savingsPercent', () => {
  it('rounds down the per-unit saving', () => {
    expect(savingsPercent(229, 151.6)).toBe(33);
    expect(savingsPercent(229, 97.9)).toBe(57);
  });

  it('returns 0 when there is no saving', () => {
    expect(savingsPercent(100, 100)).toBe(0);
    expect(savingsPercent(0, 50)).toBe(0);
  });
});

describe('counts', () => {
  it('formats and pluralises', () => {
    expect(formatCount(100000)).toBe('1,00,000');
    expect(pluralize(1, 'product')).toBe('1 product');
    expect(pluralize(533, 'product')).toBe('533 products');
  });
});
