import { print, shape, text } from './build';

/**
 * Small and unusual formats: a round badge, a square product label, a pen barrel and an address
 * stamp, each on a real product size. Re-authored for the new Studio; copy, colours and type are new.
 */

const ROUND = print(700, 700, 18, 24, 'ellipse'); // 59.3 mm round card
const LABEL = print(900, 900, 12, 18); // 76.2 mm square label
const PEN = print(1200, 240, 0, 20); // 101.6 × 20.3 mm pen print area
const STAMP = print(600, 200, 0, 15); // 50.8 × 16.9 mm stamp

const INK = '#171c26';
const DEEP = '#2f2a7a';
const INDIGO = '#4b43d6';
const MARIGOLD = '#e8930c';
const IVORY = '#f6f3ec';
const FOREST = '#1f3b2d';
const GOLD = '#b08d57';

export const SMALL_TEMPLATES = [
  {
    id: 'round-centred-badge',
    name: 'Centred badge',
    description: 'A ringed badge with your brand in the middle, for round cards, badges, labels and stamps.',
    category: 'Labels & stamps',
    tags: ['badge', 'round', 'seal', 'sticker', 'logo'],
    families: ['visiting-card', 'sign-poster', 'label-packaging', 'gift', 'stamp', 'stationery', 'round-pad'],
    rights: 'cleared',
    basedOn: 'badge-center',
    surfaces: {
      front: {
        print: ROUND,
        background: { color: DEEP },
        elements: [
          shape('f-ring', 'circle', [6.65, 6.65, 46, 46], { name: 'Ring', fill: null, stroke: MARIGOLD, strokeWidth: 0.6 }),
          shape('f-star', 'star', [27.15, 13, 5, 5], { name: 'Star', fill: MARIGOLD }),
          text('f-brand', [9.65, 22.5, 40], 'YOUR BRAND', { size: 11, weight: 800, color: '#ffffff', align: 'center', letterSpacing: 0.04 }),
          text('f-since', [9.65, 31, 40], 'EST. 2026', { size: 6, weight: 600, color: MARIGOLD, align: 'center', letterSpacing: 0.25 }),
        ],
      },
    },
  },
  {
    id: 'label-product',
    name: 'Product label',
    description: 'A brand band, the product name in serif and a line for weight or ingredients.',
    category: 'Labels & stamps',
    tags: ['label', 'product', 'sticker', 'jar', 'packaging'],
    families: ['label-packaging', 'gift', 'stationery'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: LABEL,
        background: { color: IVORY },
        elements: [
          shape('f-band', 'rect', [-1.02, -1.02, 78.24, 24.02], { name: 'Brand band', fill: FOREST }),
          text('f-brand', [6, 9.3, 64.2], 'BRAND', { size: 9, weight: 800, color: IVORY, align: 'center', letterSpacing: 0.3 }),
          text('f-name', [6, 29, 64.2], 'Product\nName', { font: 'Fraunces', size: 20, weight: 600, color: FOREST, align: 'center', lineHeight: 1 }),
          shape('f-rule', 'line', [30.1, 48.3, 16, 0.35], { name: 'Divider', fill: null, stroke: GOLD, strokeWidth: 0.35 }),
          text('f-size', [6, 51.5, 64.2], 'Small batch · 250 g', { size: 8, weight: 500, color: '#3d4250', align: 'center' }),
          text('f-notes', [6, 58.5, 64.2], 'Ingredients or a short description\ngo here', { size: 6, color: '#6b7080', align: 'center', lineHeight: 1.35 }),
        ],
      },
    },
  },
  {
    id: 'pen-wordmark',
    name: 'Sleek pen wordmark',
    description: 'Your brand in spaced capitals with your website beside it, sized for a pen barrel.',
    category: 'Promotions',
    tags: ['pen', 'wordmark', 'logo', 'branding', 'giveaway'],
    families: ['pen'],
    rights: 'cleared',
    basedOn: 'modern-custom-pen-wordmark',
    surfaces: {
      front: {
        print: PEN,
        background: { color: null },
        elements: [
          text('f-brand', [6, 7.3, 50], 'YOUR BRAND', { size: 11, weight: 800, color: INK, letterSpacing: 0.18 }),
          shape('f-divider', 'rect', [58, 6, 0.4, 8.3], { name: 'Divider', fill: INDIGO }),
          text('f-web', [61, 8.3, 36], 'yourwebsite.com', { size: 8, weight: 500, color: INDIGO }),
        ],
      },
    },
  },
  {
    id: 'stamp-address',
    name: 'Address stamp',
    description: 'A framed company name and address in one ink colour, for office stamps.',
    category: 'Labels & stamps',
    tags: ['stamp', 'address', 'rubber', 'office'],
    families: ['stamp'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: STAMP,
        background: { color: null },
        elements: [
          shape('f-frame', 'rect', [1.6, 1.6, 47.6, 13.7], { name: 'Frame', fill: null, stroke: INK, strokeWidth: 0.4, cornerRadius: 0.6 }),
          text('f-company', [1.6, 3.2, 47.6], 'YOUR COMPANY NAME', { size: 7, weight: 800, color: INK, align: 'center', letterSpacing: 0.06 }),
          text('f-address', [1.6, 7.3, 47.6], 'Street address, Area\nCity 000 000 · +91 00000 00000', { size: 5.5, weight: 500, color: INK, align: 'center', lineHeight: 1.3 }),
        ],
      },
    },
  },
];
