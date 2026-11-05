import { Circle, Image, Minus, MoveRight, Shapes, Square, Star, Triangle, Type, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DesignElement, ShapeKind } from '../schema/types';

const SHAPE_ICONS: Record<ShapeKind, LucideIcon> = { rect: Square, ellipse: Circle, line: Minus, triangle: Triangle, star: Star, arrow: MoveRight };

/** Decorative type icon for layer rows and the inspector header (the type is also in the name). */
export function ElementIcon({ element, className }: { element: DesignElement; className?: string }) {
  const Icon = element.type === 'text' ? Type : element.type === 'image' ? (element.source.kind === 'graphic' ? Shapes : Image) : SHAPE_ICONS[element.shape];
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} />;
}
