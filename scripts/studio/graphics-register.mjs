/**
 * The 33 graphics of the original Studio (Asset Inventory §7): names as the original showed them,
 * the group they go in, search tags, and their usage rights (decision D5).
 *
 * Rights check (M9, 2026-11-05): every graphic is a small hand-written SVG (147–724 characters of
 * basic shapes and gradients) defined inline in the original site's own editor code. None carries
 * a licence, author, copyright or editor metadata, and none matches a known icon set. That points
 * to them having been made for the original site, but who holds the rights — and on what terms —
 * is not confirmed. Until the business confirms, every graphic stays `unconfirmed`: listed here,
 * never extracted into the app, never shown in the Studio.
 *
 * To clear a graphic once the rights are confirmed: set `rights` to 'cleared' (or
 * 'attribution-required' with an `attribution`), then run `npm run studio:graphics`.
 */

export const GRAPHICS_SOURCE = {
  chunk: '_next/static/chunks/10tigen5gn4-f.js',
  note: 'Original Studio graphics library (`eJ(name, svg)` entries), read from ../recovered without modifying it.',
};

const UNCONFIRMED = 'unconfirmed';

/** @type {{ name: string; group: 'Backgrounds' | 'Icons' | 'Illustrations' | 'Badges'; tags: string[]; rights: 'cleared' | 'attribution-required' | 'unconfirmed'; attribution?: string }[]} */
export const GRAPHICS = [
  { name: 'Sunset', group: 'Backgrounds', tags: ['gradient', 'warm', 'orange'], rights: UNCONFIRMED },
  { name: 'Leaves', group: 'Backgrounds', tags: ['nature', 'green', 'botanical'], rights: UNCONFIRMED },
  { name: 'Abstract', group: 'Backgrounds', tags: ['shapes', 'circles', 'modern'], rights: UNCONFIRMED },
  { name: 'Marble', group: 'Backgrounds', tags: ['texture', 'stone', 'luxury'], rights: UNCONFIRMED },
  { name: 'Ocean gradient', group: 'Backgrounds', tags: ['blue', 'sea', 'gradient'], rights: UNCONFIRMED },
  { name: 'Paper texture', group: 'Backgrounds', tags: ['texture', 'grain', 'kraft'], rights: UNCONFIRMED },
  { name: 'Luxury navy', group: 'Backgrounds', tags: ['dark', 'gold', 'premium'], rights: UNCONFIRMED },
  { name: 'Soft geometry', group: 'Backgrounds', tags: ['shapes', 'pastel', 'modern'], rights: UNCONFIRMED },
  { name: 'Heart', group: 'Icons', tags: ['love', 'wedding', 'valentine'], rights: UNCONFIRMED },
  { name: 'Star', group: 'Icons', tags: ['rating', 'favourite', 'award'], rights: UNCONFIRMED },
  { name: 'Check', group: 'Icons', tags: ['tick', 'done', 'approved'], rights: UNCONFIRMED },
  { name: 'Camera', group: 'Icons', tags: ['photo', 'photography', 'studio'], rights: UNCONFIRMED },
  { name: 'Bolt', group: 'Icons', tags: ['lightning', 'energy', 'fast'], rights: UNCONFIRMED },
  { name: 'Location', group: 'Icons', tags: ['address', 'map', 'pin'], rights: UNCONFIRMED },
  { name: 'Phone', group: 'Icons', tags: ['call', 'contact', 'mobile'], rights: UNCONFIRMED },
  { name: 'Website', group: 'Icons', tags: ['web', 'globe', 'internet', 'contact'], rights: UNCONFIRMED },
  { name: 'Email', group: 'Icons', tags: ['mail', 'envelope', 'contact'], rights: UNCONFIRMED },
  { name: 'Calendar', group: 'Icons', tags: ['date', 'event', 'appointment'], rights: UNCONFIRMED },
  { name: 'Secure', group: 'Icons', tags: ['shield', 'safety', 'trust'], rights: UNCONFIRMED },
  { name: 'Delivery', group: 'Icons', tags: ['truck', 'shipping', 'courier'], rights: UNCONFIRMED },
  { name: 'Flower', group: 'Illustrations', tags: ['floral', 'nature', 'celebration'], rights: UNCONFIRMED },
  { name: 'Rocket', group: 'Illustrations', tags: ['launch', 'startup', 'growth'], rights: UNCONFIRMED },
  { name: 'Gift', group: 'Illustrations', tags: ['present', 'birthday', 'celebration'], rights: UNCONFIRMED },
  { name: 'Business growth', group: 'Illustrations', tags: ['chart', 'business', 'finance'], rights: UNCONFIRMED },
  { name: 'Customer support', group: 'Illustrations', tags: ['help', 'service', 'headset'], rights: UNCONFIRMED },
  { name: 'Creative teamwork', group: 'Illustrations', tags: ['team', 'people', 'office'], rights: UNCONFIRMED },
  { name: 'Global delivery', group: 'Illustrations', tags: ['world', 'shipping', 'export'], rights: UNCONFIRMED },
  { name: 'Priority mail', group: 'Badges', tags: ['stamp', 'post', 'envelope'], rights: UNCONFIRMED },
  { name: 'Air mail', group: 'Badges', tags: ['stamp', 'post', 'plane'], rights: UNCONFIRMED },
  { name: 'Verified seal', group: 'Badges', tags: ['seal', 'quality', 'certified'], rights: UNCONFIRMED },
  { name: 'Leaf monogram', group: 'Badges', tags: ['emblem', 'nature', 'logo'], rights: UNCONFIRMED },
  { name: 'Express stamp', group: 'Badges', tags: ['stamp', 'fast', 'shipping'], rights: UNCONFIRMED },
  { name: 'Premium crest', group: 'Badges', tags: ['crest', 'shield', 'luxury'], rights: UNCONFIRMED },
];

/** "Business growth" → "business-growth" (the id stored in designs). */
export function graphicId(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
