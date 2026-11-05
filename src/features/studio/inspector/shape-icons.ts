import { Circle, Hexagon, Minus, MoveRight, Square, Star, Triangle, type LucideIcon } from 'lucide-react';
import type { ShapeKind } from '../schema/types';

/** Shared by layer rows, the inspector header and the Shapes tool. */
export const SHAPE_ICONS: Record<ShapeKind, LucideIcon> = { rect: Square, circle: Circle, ellipse: Circle, line: Minus, triangle: Triangle, star: Star, polygon: Hexagon, arrow: MoveRight };
