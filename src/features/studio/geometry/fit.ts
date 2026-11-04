/** Fitting a print area into the on-screen workspace. The canvas stage (M5) uses the same maths. */

export interface Size {
  width: number;
  height: number;
}

/** Space kept around the sheet for the dimension labels, so nothing touches the panel edges. */
export function workspacePadding(viewportWidth: number): number {
  if (viewportWidth < 480) return 36;
  if (viewportWidth < 1024) return 48;
  return 64;
}

/** Scale that fits `content` (design px) inside `available` (screen px) with `padding` on every side. 0 = no room. */
export function fitScale(available: Size, content: Size, padding: number): number {
  const width = available.width - 2 * padding;
  const height = available.height - 2 * padding;
  if (width <= 0 || height <= 0 || content.width <= 0 || content.height <= 0) return 0;
  return Math.min(width / content.width, height / content.height);
}
