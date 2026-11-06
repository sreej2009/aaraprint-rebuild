import { print, rule, shape, text } from './build';

/**
 * Flyers, invitations, a letterhead and an envelope, each laid out on a real product size: A5
 * flyer (105 × 148 mm), 5 × 7 in invitation, 5 in square invitation, A4 letterhead and DL
 * envelope. Similar sizes get a fitted copy (templates/compat.ts). Re-authored for the new
 * Studio; copy, colours and type are new.
 */

const A5 = print(1240, 1748, 36, 36);
const INVITE = print(1500, 2100, 36, 36);
const SQUARE = print(1500, 1500, 36, 36);
const A4 = print(2480, 3508, 24, 48);
const DL = print(2598, 1299, 24, 48);

const INK = '#171c26';
const BODY = '#3d4250';
const MUTED = '#6b7080';
const INDIGO = '#4b43d6';
const MARIGOLD = '#e8930c';
const IVORY = '#f6f3ec';
const GOLD = '#b08d57';
const FOREST = '#1f3b2d';

export const PRINT_TEMPLATES = [
  {
    id: 'flyer-event-poster',
    name: 'Event poster',
    description: 'A big two-line title over a colour block, with the date, venue and how to join.',
    category: 'Events',
    tags: ['event', 'poster', 'concert', 'workshop', 'bold'],
    families: ['sign-poster', 'stationery'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: A5,
        background: { color: INK },
        elements: [
          shape('f-block', 'rect', [-3.05, -3.05, 111.1, 65], { name: 'Colour block', fill: INDIGO }),
          shape('f-sun', 'circle', [62, 30, 34, 34], { name: 'Circle', fill: MARIGOLD }),
          text('f-title', [9, 70, 87], 'Your Event\nTitle Here', { size: 32, weight: 800, color: '#ffffff', lineHeight: 1.02 }),
          text('f-date', [9, 97, 87], 'SAT 12 DEC · 7 PM', { size: 11, weight: 700, color: MARIGOLD, letterSpacing: 0.06 }),
          text('f-venue', [9, 104.5, 87], 'Venue name, Street, City', { size: 9, color: '#c9ccd6' }),
          rule('f-rule', 9, 124, 87, 0.5, INDIGO),
          text('f-footer', [9, 127.5, 87], 'Free entry · Register at yourwebsite.com', { size: 8, weight: 500, color: '#ffffff' }),
        ],
      },
    },
  },
  {
    id: 'flyer-sale',
    name: 'Sale announcement',
    description: 'A bold discount on a bright background, with the offer and your shop on a white card.',
    category: 'Promotions',
    tags: ['sale', 'offer', 'discount', 'shop', 'bright'],
    families: ['sign-poster', 'stationery'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: A5,
        background: { color: MARIGOLD },
        elements: [
          text('f-kicker', [8, 13, 89], 'BIG SALE', { size: 18, weight: 800, color: INK, align: 'center', letterSpacing: 0.12 }),
          text('f-amount', [8, 22, 89], '50%', { size: 84, weight: 800, color: INK, align: 'center', lineHeight: 1 }),
          text('f-off', [8, 53, 89], 'OFF', { size: 28, weight: 800, color: '#ffffff', align: 'center', letterSpacing: 0.1 }),
          shape('f-card', 'rect', [14, 76, 77, 36], { name: 'Offer card', fill: '#ffffff', cornerRadius: 3 }),
          text('f-offer', [16, 82, 73], 'On everything in store\nthis weekend only', { size: 11, weight: 600, color: INK, align: 'center', lineHeight: 1.3 }),
          text('f-shop', [16, 100, 73], 'Shop name · Street, City', { size: 8.5, weight: 600, color: INDIGO, align: 'center' }),
          text('f-terms', [8, 134, 89], 'Offer valid until 31 December. Terms apply.', { size: 7, color: INK, align: 'center' }),
        ],
      },
    },
  },
  {
    id: 'flyer-editorial-notice',
    name: 'Editorial notice',
    description: 'A calm serif headline with room for a short message and your contact details.',
    category: 'Business',
    tags: ['minimal', 'editorial', 'announcement', 'notice', 'serif'],
    families: ['sign-poster', 'stationery'],
    rights: 'cleared',
    basedOn: null,
    surfaces: {
      front: {
        print: A5,
        background: { color: IVORY },
        elements: [
          shape('f-bar', 'rect', [-3.05, -3.05, 9.05, 154.1], { name: 'Side bar', fill: INDIGO }),
          text('f-kicker', [14, 14, 84], 'ANNOUNCEMENT', { size: 8.5, weight: 700, color: INDIGO, letterSpacing: 0.18 }),
          text('f-title', [14, 22, 84], 'Something new\nis coming', { font: 'Fraunces', size: 28, weight: 500, color: INK, lineHeight: 1.08 }),
          text('f-body', [14, 52, 80], 'Share the details here:\nwhat’s happening, who it’s for\nand why it matters.', { size: 10, color: BODY, lineHeight: 1.5 }),
          rule('f-rule', 14, 120, 77, 0.35, INK),
          text('f-web', [14, 124, 40], 'yourcompany.com', { size: 9, weight: 600, color: INK }),
          text('f-phone', [52, 124, 39], '+91 00000 00000', { size: 9, color: BODY, align: 'right' }),
        ],
      },
    },
  },
  {
    id: 'invite-modern-wedding',
    name: 'Modern wedding',
    description: 'A fine gold frame and italic serif names, with RSVP details on a forest-green back.',
    category: 'Events',
    tags: ['wedding', 'invitation', 'elegant', 'serif', 'two-sided'],
    families: ['stationery', 'sign-poster'],
    rights: 'cleared',
    basedOn: 'wedding-modern-minimal',
    surfaces: {
      front: {
        print: INVITE,
        background: { color: IVORY },
        elements: [
          shape('f-frame', 'rect', [8, 8, 111, 161.8], { name: 'Frame', fill: null, stroke: GOLD, strokeWidth: 0.4 }),
          text('f-kicker', [14, 32, 99], 'TOGETHER WITH THEIR FAMILIES', { size: 7, weight: 600, color: '#6d6a62', align: 'center', letterSpacing: 0.22 }),
          text('f-names', [14, 42, 99], 'Asha\n&\nRohan', { font: 'Fraunces', size: 30, italic: true, color: INK, align: 'center', lineHeight: 1.12 }),
          text('f-invite', [14, 86, 99], 'request the pleasure of your company', { size: 8.5, color: BODY, align: 'center' }),
          text('f-date', [14, 100, 99], 'SATURDAY, 12 DECEMBER 2026', { size: 9, weight: 700, color: INK, align: 'center', letterSpacing: 0.12 }),
          text('f-place', [14, 108, 99], '4 PM · The Garden Venue, City', { size: 8.5, color: BODY, align: 'center' }),
          rule('f-rule', 53.5, 126, 20, 0.35, GOLD),
          text('f-after', [14, 131, 99], 'Reception to follow', { font: 'Fraunces', size: 10, italic: true, color: INK, align: 'center' }),
        ],
      },
      back: {
        print: INVITE,
        background: { color: FOREST },
        elements: [
          text('b-rsvp', [14, 50, 99], 'RSVP', { font: 'Fraunces', size: 22, weight: 500, color: IVORY, align: 'center', letterSpacing: 0.1 }),
          text('b-details', [14, 64, 99], 'Kindly reply by 1 November\n+91 00000 00000\nrsvp@yourwedding.com', { size: 9, color: '#dfe6df', align: 'center', lineHeight: 1.6 }),
          rule('b-rule', 53.5, 95, 20, 0.35, GOLD),
          text('b-tag', [14, 100, 99], '#AshaAndRohan', { size: 8, weight: 600, color: GOLD, align: 'center', letterSpacing: 0.08 }),
        ],
      },
    },
  },
  {
    id: 'invite-birthday-bash',
    name: 'Birthday bash',
    description: 'Confetti shapes on indigo, a big friendly headline and an RSVP pill.',
    category: 'Events',
    tags: ['birthday', 'party', 'kids', 'invitation', 'bold'],
    families: ['stationery', 'gift', 'sign-poster'],
    rights: 'cleared',
    basedOn: 'birthday-confetti-bash',
    surfaces: {
      front: {
        print: SQUARE,
        background: { color: INDIGO },
        elements: [
          shape('f-star', 'star', [10, 10, 11, 11], { name: 'Confetti star', fill: MARIGOLD, rotation: 12 }),
          shape('f-dot-1', 'circle', [101, 15, 6, 6], { name: 'Confetti dot', fill: '#f2a7c3' }),
          shape('f-dot-2', 'circle', [14, 103, 7, 7], { name: 'Confetti dot', fill: '#7fd1b9' }),
          shape('f-triangle', 'triangle', [103, 99, 9, 8], { name: 'Confetti triangle', fill: '#f2a7c3', rotation: -18 }),
          shape('f-star-2', 'star', [108, 54, 7, 7], { name: 'Confetti star', fill: '#ffffff', rotation: -10 }),
          shape('f-dot-3', 'circle', [10, 58, 4, 4], { name: 'Confetti dot', fill: MARIGOLD }),
          text('f-kicker', [14, 31, 99], 'YOU’RE INVITED', { size: 9, weight: 700, color: IVORY, align: 'center', letterSpacing: 0.2 }),
          text('f-title', [14, 39, 99], 'Maya is\nturning 7!', { size: 30, weight: 800, color: '#ffffff', align: 'center', lineHeight: 1.04 }),
          text('f-when', [14, 69, 99], 'Saturday 12 December · 4 PM', { size: 10, weight: 600, color: MARIGOLD, align: 'center' }),
          text('f-where', [14, 77, 99], 'Party venue, Street, City', { size: 9, color: '#e3e1fb', align: 'center' }),
          shape('f-pill', 'rect', [33.5, 90, 60, 11], { name: 'RSVP pill', fill: '#ffffff', cornerRadius: 5.5 }),
          text('f-rsvp', [33.5, 93.2, 60], 'RSVP +91 00000 00000', { size: 8, weight: 700, color: INDIGO, align: 'center' }),
        ],
      },
    },
  },
  {
    id: 'letterhead-editorial-sidebar',
    name: 'Editorial sidebar letterhead',
    description: 'A soft sidebar holds your name, tagline and contact details; the page stays clear for the letter.',
    category: 'Stationery',
    tags: ['letterhead', 'a4', 'corporate', 'editorial', 'minimal'],
    families: ['stationery'],
    rights: 'cleared',
    basedOn: 'modern-letterhead-sidebar-editorial',
    surfaces: {
      front: {
        print: A4,
        background: { color: null },
        elements: [
          shape('f-sidebar', 'rect', [-2.03, -2.03, 54.03, 301.06], { name: 'Sidebar', fill: '#eef0f6' }),
          shape('f-accent', 'rect', [52, -2.03, 1.2, 301.06], { name: 'Accent line', fill: INDIGO }),
          text('f-company', [12, 22, 36], 'Company\nName', { font: 'Fraunces', size: 20, weight: 600, color: INK, lineHeight: 1.1 }),
          text('f-tagline', [12, 42, 36], 'Tagline or\nservice line', { size: 8.5, weight: 500, color: INDIGO, lineHeight: 1.4 }),
          text('f-contact', [12, 248, 38], 'Street address\nCity 000 000\n+91 00000 00000\nhello@yourcompany.com\nyourcompany.com', { size: 7.5, color: BODY, lineHeight: 1.55 }),
          text('f-date', [64, 30, 130], '12 December 2026', { size: 9, color: MUTED }),
          text('f-greeting', [64, 48, 130], 'Dear Name,', { size: 10, color: INK }),
          text('f-body', [64, 58, 130], 'Start writing your letter here.', { size: 10, color: BODY, lineHeight: 1.5 }),
          text('f-sign', [64, 110, 130], 'Your Name\nJob Title', { size: 10, weight: 600, color: INK, lineHeight: 1.4 }),
        ],
      },
    },
  },
  {
    id: 'envelope-minimal-corporate',
    name: 'Minimal corporate envelope',
    description: 'Your mark and return address top left, with a fine colour band along the bottom.',
    category: 'Stationery',
    tags: ['envelope', 'dl', 'corporate', 'minimal', 'letter'],
    families: ['stationery'],
    rights: 'cleared',
    basedOn: 'envelope-minimal-corporate',
    surfaces: {
      front: {
        print: DL,
        background: { color: null },
        elements: [
          shape('f-mark', 'rect', [14, 14, 8, 8], { name: 'Logo mark', fill: INDIGO, cornerRadius: 1.5 }),
          text('f-company', [26, 14.2, 90], 'Company Name', { size: 11, weight: 700, color: INK }),
          text('f-address', [26, 19.6, 90], 'Street address · City 000 000', { size: 7.5, color: '#5b6170' }),
          text('f-web', [14, 96, 90], 'yourcompany.com', { size: 7.5, weight: 600, color: INDIGO }),
          shape('f-band', 'rect', [-2.03, 104, 224.06, 8.03], { name: 'Colour band', fill: INDIGO }),
        ],
      },
    },
  },
];
