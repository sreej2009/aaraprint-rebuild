import { CircleQuestionMark, ImageUp, LayoutTemplate, Package, PaintBucket, Shapes, Sparkles, Type, type LucideIcon } from 'lucide-react';

export type ToolId = 'templates' | 'text' | 'uploads' | 'graphics' | 'shapes' | 'background' | 'product' | 'help';

export interface ToolDefinition {
  id: ToolId;
  /** Rail and toolbar label. */
  label: string;
  /** Panel heading. */
  title: string;
  icon: LucideIcon;
  /** One line under the panel heading. */
  intro: string;
  /** Built in a later Phase 3 milestone; the panel says so instead of showing empty controls. */
  comingSoon: boolean;
}

export const TOOLS: readonly ToolDefinition[] = [
  { id: 'templates', label: 'Templates', title: 'Templates', icon: LayoutTemplate, intro: 'Start from a layout made to fit this product.', comingSoon: true },
  { id: 'text', label: 'Text', title: 'Text', icon: Type, intro: 'Add headings, names, contact details and more.', comingSoon: false },
  { id: 'uploads', label: 'Uploads', title: 'Uploads', icon: ImageUp, intro: 'Add your logo or photos. PNG, JPG, WEBP, GIF or SVG up to 20 MB.', comingSoon: true },
  { id: 'graphics', label: 'Graphics', title: 'Graphics', icon: Sparkles, intro: 'Icons, badges and illustrations for your design.', comingSoon: false },
  { id: 'shapes', label: 'Shapes', title: 'Shapes', icon: Shapes, intro: 'Rectangles, circles, lines, stars and arrows.', comingSoon: false },
  { id: 'background', label: 'Background', title: 'Background', icon: PaintBucket, intro: 'Colour the whole side, right to the edge.', comingSoon: true },
  { id: 'product', label: 'Product', title: 'Product and print size', icon: Package, intro: 'What you’re designing and how it will print.', comingSoon: false },
  { id: 'help', label: 'Help', title: 'Print tips', icon: CircleQuestionMark, intro: 'How to get a sharp, well-trimmed print.', comingSoon: false },
];

/** Rail order: design tools, then product; Help sits at the bottom of the rail. */
export const RAIL_TOOLS = TOOLS.filter((t) => t.id !== 'help');
export const HELP_TOOL = TOOLS.find((t) => t.id === 'help')!;

/** Phone bottom toolbar; everything else lives under "More". */
export const PHONE_TOOLBAR: readonly ToolId[] = ['templates', 'text', 'uploads', 'graphics'];
export const PHONE_MORE: readonly ToolId[] = ['shapes', 'background', 'product', 'help'];

export function toolById(id: ToolId): ToolDefinition {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool "${id}"`);
  return tool;
}

export function isToolId(value: string | null): value is ToolId {
  return TOOLS.some((t) => t.id === value);
}
