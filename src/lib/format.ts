const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const withPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format an amount in paise (1/100 rupee) as Indian rupees.
 * Whole amounts drop the decimals ("₹229"); fractional amounts keep two ("₹2.29").
 */
export function formatINR(paise: number): string {
  const formatter = paise % 100 === 0 ? wholeRupees : withPaise;
  return formatter.format(paise / 100);
}

/** Price difference for an option value: "+₹150", "−₹20", or "" for no change. */
export function formatPriceDelta(paise: number): string {
  if (paise === 0) return '';
  return `${paise > 0 ? '+' : '−'}${formatINR(Math.abs(paise))}`;
}

/** Percentage saved going from `fromPaise` to `toPaise` per unit, rounded down. */
export function savingsPercent(referencePaise: number, actualPaise: number): number {
  if (referencePaise <= 0 || actualPaise >= referencePaise) return 0;
  return Math.floor(((referencePaise - actualPaise) / referencePaise) * 100);
}

const integer = new Intl.NumberFormat('en-IN');

/** Format a count with Indian digit grouping ("1,00,000"). */
export function formatCount(value: number): string {
  return integer.format(value);
}

/** "1 product" / "33 products". */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : plural}`;
}
