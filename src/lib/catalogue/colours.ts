/**
 * Swatch colours for option labels found in the catalogue ("Navy", "Bottle Green",
 * "Navy & White"). Approximate display colours — the printed product photo is the reference.
 */
const COLOURS: Record<string, string> = {
  white: '#ffffff',
  'bright white': '#ffffff',
  'natural white': '#f4f1e8',
  ivory: '#f6f0dc',
  black: '#1c1c1e',
  'matte black': '#2a2a2a',
  khaki: '#c3b091',
  navy: '#1f2a4d',
  'denim blue': '#3f5f8f',
  red: '#c62828',
  grey: '#8e9196',
  'grey melange': '#b4b6b9',
  'heather grey': '#a3a6aa',
  'grey fil-a-fil': '#b8bcc2',
  olive: '#6b6b2f',
  maroon: '#6d1a26',
  charcoal: '#36393f',
  'royal blue': '#2453c4',
  green: '#2e7d32',
  'bottle green': '#1d4a33',
  'forest green': '#2f5d3a',
  'lime green': '#8bc34a',
  blue: '#1e66c9',
  'sky blue': '#7cc4ec',
  'sky blue fil-a-fil': '#a9cde8',
  orange: '#ef6c00',
  'safety orange': '#ff6a13',
  yellow: '#f6c915',
  'safety yellow': '#e3f218',
  pink: '#ec7fa9',
  'pink oxford': '#f2c4d0',
  'neon pink': '#ff3fa4',
  'neon green': '#39ff6a',
  'neon purple': '#a64dff',
  lavender: '#b9a6dc',
  beige: '#d9c7a7',
  natural: '#e8dcc4',
  tan: '#c19a6b',
  brown: '#6b4430',
  clear: '#eef3f6',
  silver: '#c0c4c8',
  steel: '#a8adb3',
  gunmetal: '#4a4f55',
  gold: '#c9a24b',
  'rose gold': '#d4a39a',
  wood: '#a47551',
  'natural wood': '#c8a27a',
};

export interface SwatchColour {
  hex: string;
  /** Second colour for two-tone labels such as "Navy & White". */
  secondHex?: string;
}

export function swatchFor(label: string): SwatchColour | null {
  const key = label.trim().toLowerCase();
  if (COLOURS[key]) return { hex: COLOURS[key] };
  const parts = key.split(/\s*&\s*/);
  if (parts.length === 2 && COLOURS[parts[0]!] && COLOURS[parts[1]!]) return { hex: COLOURS[parts[0]!]!, secondHex: COLOURS[parts[1]!] };
  return null;
}
