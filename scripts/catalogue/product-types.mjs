/**
 * Product types: one per product, used for the "Type" filter on category pages.
 *
 * The original site exposed `?type=` sub-types that never filtered anything (see
 * AARAPRINT_RECONNAISSANCE.md §3.1). These rules classify every product by its slug.
 * Where an original sub-type slug made sense it is reused, so old links keep working
 * (e.g. /categories/clothing-caps-bags?type=caps). Rules are checked in order; the
 * last rule in each category has no pattern and catches everything else.
 */
export const PRODUCT_TYPES = {
  'visiting-cards': [
    { slug: 'card-holders', name: 'Card holders', match: /^card-accessory-/ },
    { slug: 'design-services', name: 'Design services', match: /^card-service-/ },
    { slug: 'visiting-cards', name: 'Visiting cards' },
  ],
  'stationery-letterheads-notebooks': [
    { slug: 'weddings', name: 'Wedding stationery', match: /wedding/ },
    { slug: 'invitations-announcements', name: 'Invitations & cards', match: /^(announcement|invitation|invite)-/ },
    { slug: 'notebooks-diaries', name: 'Notebooks & diaries', match: /notebook|diary|notepad|sticky-notes|booklets/ },
    {
      slug: 'business-stationery',
      name: 'Business stationery',
      match: /letterhead|envelope|compliment|note-cards|bill-books|invoice-books|presentation|ring-binder|cash-vouchers/,
    },
    { slug: 'awards-certificates', name: 'Awards & certificates', match: /award|certificate|plaque|memento/ },
    { slug: 'technology', name: 'Tech accessories', match: /pen-drive|usb|laptop-skin|mouse-pad/ },
    { slug: 'id-cards-lanyards', name: 'ID cards, lanyards & keychains', match: /id-cards|lanyard|wrist-band|keychain/ },
    { slug: 'desk-gifting', name: 'Desk & gifting' },
  ],
  'stamps-and-ink': [
    { slug: 'date-stamps', name: 'Date stamps', match: /date/ },
    { slug: 'seals-embossers', name: 'Seals & embossers', match: /seal|embosser|notary/ },
    { slug: 'self-inking', name: 'Self-inking & pre-inked', match: /self-inking|pre-inking/ },
    { slug: 'specialty-stamps', name: 'Specialty stamps' },
  ],
  'signs-posters-marketing-materials': [
    { slug: 'posters', name: 'Posters', match: /poster/ },
    {
      slug: 'banners-standees',
      name: 'Banners, flags & standees',
      match: /banner|flag|backdrop|standee|x-stand|rollup|tension/,
    },
    { slug: 'flyers-brochures', name: 'Flyers & brochures', match: /^brochure-|^flyer-(a4|a5|a6|dl|standard|bulk|booklet|brochure)/ },
    { slug: 'event-table-displays', name: 'Event & table displays', match: /table|tent|canopy|place-mat|runner/ },
    { slug: 'signs-displays', name: 'Signs & displays', match: /^sign-/ },
    { slug: 'promotional-print', name: 'Promotional print' },
  ],
  'labels-stickers-packaging': [
    { slug: 'labels', name: 'Labels', match: /^label-|sticker-label|packaging-label/ },
    { slug: 'boxes', name: 'Boxes', match: /box/ },
    { slug: 'bags-mailers', name: 'Bags & mailers', match: /^pkg-bag-|mailer/ },
    { slug: 'tape-tags-wrapping', name: 'Tape, tags & wrapping', match: /tape|tissue|ribbon|hang-tag/ },
    { slug: 'stickers', name: 'Stickers' },
  ],
  'clothing-caps-bags': [
    { slug: 'printed-t-shirts', name: 'T-shirts', match: /tshirt/ },
    { slug: 'custom-office-shirts', name: 'Office shirts', match: /^apparel-shirt-/ },
    { slug: 'caps', name: 'Caps', match: /-cap-/ },
    { slug: 'bags', name: 'Bags', match: /^bag-/ },
    { slug: 'sportswear-hoodies', name: 'Hoodies & sportswear' },
  ],
  'mugs-albums-gifts': [
    { slug: 'mugs', name: 'Mugs', match: /mug/ },
    { slug: 'calendars', name: 'Calendars', match: /calendar/ },
    { slug: 'magnets', name: 'Magnets', match: /magnet/ },
    { slug: 'gift-hampers', name: 'Gift hampers', match: /hamper/ },
    { slug: 'frames-albums', name: 'Photo frames, prints & albums', match: /frame|canvas|acrylic|print|album/ },
    { slug: 'personalised-gifts', name: 'Personalised gifts' },
  ],
  pens: [
    { slug: 'eco-pens', name: 'Eco-friendly pens', match: /recycled|wheat/ },
    {
      slug: 'premium-pens',
      name: 'Premium & gift pens',
      match: /parker|swissbrand|submarine|premium|executive|fountain|gold|brass|marble/,
    },
    { slug: 'everyday-pens', name: 'Everyday pens' },
  ],
  drinkware: [
    { slug: 'tumblers', name: 'Tumblers', match: /tumbler/ },
    { slug: 'flasks', name: 'Flasks', match: /flask/ },
    { slug: 'glassware', name: 'Glassware', match: /glass/ },
    { slug: 'mugs-cups', name: 'Mugs & cups', match: /mug|cup/ },
    { slug: 'bottles', name: 'Bottles' },
  ],
  'custom-polo-t-shirts': [
    {
      slug: 'branded-polos',
      name: 'Branded polos',
      match: /adidas|puma|levis|arrow|us-polo|woodland|mark-spencer|monte-carlo|flying-machine|6-degree|pikmee|sports-republic|turms|parx/,
    },
    { slug: 'classic-polos', name: 'Classic & performance polos' },
  ],
  'umbrellas-rainwear': [
    { slug: 'umbrellas', name: 'Umbrellas', match: /^umbrella-/ },
    { slug: 'rain-caps-covers', name: 'Rain caps & bag covers', match: /cap|bag-cover/ },
    { slug: 'raincoats-jackets', name: 'Raincoats & jackets' },
  ],
};

export function productTypeFor(categorySlug, productSlug) {
  const rules = PRODUCT_TYPES[categorySlug];
  if (!rules) return null;
  return rules.find((rule) => !rule.match || rule.match.test(productSlug)) ?? null;
}
