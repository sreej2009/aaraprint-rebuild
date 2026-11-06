import { print, rule, shape, text } from './build';

/**
 * Visiting cards: laid out on the standard 88.9 × 50.8 mm card (1.5 mm bleed, 2 mm safe area),
 * the size of most card products. Re-authored for the new Studio from the original site's layout
 * ideas (Reconnaissance Appendix B); copy, colours and type are new.
 */

const CARD = print(1050, 600, 18, 24);
const BLEED = 1.524;
const W = 88.9;
const H = 50.8;

const INK = '#171c26';
const MUTED = '#5b6170';
const INDIGO = '#4b43d6';
const DEEP = '#2f2a7a';
const MARIGOLD = '#e8930c';
const IVORY = '#f6f3ec';

export const CARD_TEMPLATES = [
  {
    id: 'card-minimal-centred',
    name: 'Minimal centred',
    description: 'Your name and title centred on the front, company and contact details on a dark back.',
    category: 'Business',
    tags: ['minimal', 'clean', 'centred', 'two-sided'],
    families: ['visiting-card'],
    rights: 'cleared',
    basedOn: 'minimal-centered',
    surfaces: {
      front: {
        print: CARD,
        background: { color: null },
        elements: [
          text('f-name', [6, 15, W - 12], 'Your Name', { font: 'Fraunces', size: 16, weight: 600, color: INK, align: 'center' }),
          rule('f-rule', W / 2 - 7, 25.5, 14, 0.35, INDIGO),
          text('f-title', [6, 28, W - 12], 'JOB TITLE', { size: 7.5, weight: 600, color: MUTED, align: 'center', letterSpacing: 0.16 }),
        ],
      },
      back: {
        print: CARD,
        background: { color: '#1b1f27' },
        elements: [
          text('b-company', [6, 12, W - 12], 'Company Name', { size: 11, weight: 700, color: '#ffffff', align: 'center' }),
          text('b-contact', [6, 21, W - 12], '+91 00000 00000\nhello@yourcompany.com\nyourcompany.com', { size: 7.5, color: '#d9dce3', align: 'center', lineHeight: 1.5 }),
        ],
      },
    },
  },
  {
    id: 'card-bold-left',
    name: 'Bold left-aligned',
    description: 'A colour block with your initials, and your details set strong on the left.',
    category: 'Business',
    tags: ['bold', 'colour block', 'monogram', 'modern'],
    families: ['visiting-card'],
    rights: 'cleared',
    basedOn: 'bold-left-aligned',
    surfaces: {
      front: {
        print: CARD,
        background: { color: null },
        elements: [
          shape('f-band', 'rect', [-BLEED, -BLEED, 28 + BLEED, H + 2 * BLEED], { name: 'Colour block', fill: INDIGO }),
          text('f-initials', [3, 18.5, 22], 'YN', { font: 'Fraunces', size: 24, weight: 600, color: '#ffffff', align: 'center' }),
          text('f-name', [34, 10, 50], 'Your Name', { size: 14, weight: 800, color: INK }),
          text('f-title', [34, 17.6, 50], 'Job Title', { size: 8, weight: 500, color: INDIGO }),
          text('f-contact', [34, 29, 52], '+91 00000 00000\nhello@yourcompany.com\nyourcompany.com', { size: 7, color: MUTED, lineHeight: 1.45 }),
        ],
      },
    },
  },
  {
    id: 'card-diagonal-spotlight',
    name: 'Diagonal spotlight',
    description: 'A bright band across a dark card, with your contact details running along it.',
    category: 'Business',
    tags: ['bold', 'diagonal', 'dark', 'bright'],
    families: ['visiting-card'],
    rights: 'cleared',
    basedOn: 'diagonal-spotlight',
    surfaces: {
      front: {
        print: CARD,
        background: { color: INK },
        elements: [
          shape('f-band', 'rect', [-15, 29, 120, 12], { name: 'Diagonal band', fill: MARIGOLD, rotation: -14 }),
          text('f-name', [6, 7, 60], 'Your Name', { size: 15, weight: 800, color: '#ffffff' }),
          text('f-title', [6, 14.6, 60], 'Job Title', { size: 8, weight: 500, color: '#c9ccd6' }),
          text('f-contact', [8, 33, 74], 'hello@yourcompany.com  ·  +91 00000 00000', { size: 7, weight: 700, color: INK, align: 'center' }),
        ],
      },
    },
  },
  {
    id: 'card-classic-emblem',
    name: 'Classic emblem',
    description: 'A ringed monogram on ivory, with a deep indigo back for your company and contact details.',
    category: 'Business',
    tags: ['elegant', 'emblem', 'monogram', 'two-sided'],
    families: ['visiting-card'],
    rights: 'cleared',
    basedOn: 'classic-emblem',
    surfaces: {
      front: {
        print: CARD,
        background: { color: IVORY },
        elements: [
          shape('f-ring', 'circle', [W / 2 - 10, 5.5, 20, 20], { name: 'Ring', fill: null, stroke: DEEP, strokeWidth: 0.5 }),
          text('f-initials', [W / 2 - 10, 11.2, 20], 'YN', { font: 'Fraunces', size: 17, weight: 600, color: DEEP, align: 'center' }),
          text('f-name', [6, 30, W - 12], 'Your Name', { font: 'Fraunces', size: 11, weight: 500, color: INK, align: 'center' }),
          text('f-title', [6, 36.5, W - 12], 'JOB TITLE', { size: 6.5, weight: 600, color: '#6b6a8a', align: 'center', letterSpacing: 0.2 }),
        ],
      },
      back: {
        print: CARD,
        background: { color: DEEP },
        elements: [
          shape('b-star', 'star', [W / 2 - 3, 7, 6, 6], { name: 'Star', fill: MARIGOLD }),
          text('b-company', [6, 16, W - 12], 'Company Name', { font: 'Fraunces', size: 11, weight: 600, color: IVORY, align: 'center' }),
          text('b-contact', [6, 25, W - 12], '+91 00000 00000\nhello@yourcompany.com\nyourcompany.com', { size: 7, color: '#d8d6ef', align: 'center', lineHeight: 1.5 }),
        ],
      },
    },
  },
  {
    id: 'card-editorial-serif',
    name: 'Editorial serif',
    description: 'A large serif name with a fine rule and two neat columns of details.',
    category: 'Business',
    tags: ['minimal', 'editorial', 'serif', 'classic'],
    families: ['visiting-card'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: CARD,
        background: { color: null },
        elements: [
          text('f-name', [7, 7, 75], 'Your Name', { font: 'Fraunces', size: 17, italic: true, color: INK }),
          text('f-title', [7, 15.8, 75], 'Job Title — Company', { size: 7.5, weight: 500, color: INDIGO }),
          rule('f-rule', 7, 33, W - 14, 0.25, INK),
          text('f-contact', [7, 35.5, 38], '+91 00000 00000\nhello@yourcompany.com', { size: 6.5, color: MUTED, lineHeight: 1.45 }),
          text('f-web', [45, 35.5, W - 52], 'yourcompany.com\nYour City', { size: 6.5, color: MUTED, align: 'right', lineHeight: 1.45 }),
        ],
      },
    },
  },
];
