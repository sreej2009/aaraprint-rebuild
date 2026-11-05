import { Image, Shapes, Type } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DesignElement } from '../schema/types';
import { SHAPE_ICONS } from './shape-icons';

/** Decorative type icon for layer rows and the inspector header (the type is also in the name). */
export function ElementIcon({ element, className }: { element: DesignElement; className?: string }) {
  const Icon = element.type === 'text' ? Type : element.type === 'image' ? (element.source.kind === 'graphic' ? Shapes : Image) : SHAPE_ICONS[element.shape];
  return <Icon aria-hidden="true" className={cn('size-4 shrink-0', className)} />;
}
