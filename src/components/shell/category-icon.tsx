import { CupSoda, Gift, IdCard, NotebookPen, Package, PenLine, Shirt, Signpost, Stamp, Tag, Umbrella, type LucideIcon } from 'lucide-react';

const icons: Record<string, LucideIcon> = {
  'visiting-cards': IdCard,
  'stationery-letterheads-notebooks': NotebookPen,
  'stamps-and-ink': Stamp,
  'signs-posters-marketing-materials': Signpost,
  'labels-stickers-packaging': Tag,
  'clothing-caps-bags': Shirt,
  'mugs-albums-gifts': Gift,
  pens: PenLine,
  drinkware: CupSoda,
  'custom-polo-t-shirts': Shirt,
  'umbrellas-rainwear': Umbrella,
};

export function CategoryIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = icons[slug] ?? Package;
  return <Icon aria-hidden="true" strokeWidth={1.75} className={className} />;
}
