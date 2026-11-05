/** Types for graphics-register.mjs, so tests can check the register. */
export interface RegisteredGraphic {
  name: string;
  group: 'Backgrounds' | 'Icons' | 'Illustrations' | 'Badges';
  tags: string[];
  rights: 'cleared' | 'attribution-required' | 'unconfirmed';
  attribution?: string;
}
export const GRAPHICS_SOURCE: { chunk: string; note: string };
export const GRAPHICS: RegisteredGraphic[];
export function graphicId(name: string): string;
