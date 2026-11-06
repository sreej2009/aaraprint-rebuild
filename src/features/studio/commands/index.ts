/**
 * Document commands: pure functions `(document, …args) => document`.
 * - They never mutate their input and return the *same* document when nothing changes.
 * - Only the changed surface (and element) objects are replaced; everything else is shared, so
 *   keeping 100 undo steps costs little memory.
 * - They don't set timestamps or revisions; saving does.
 */
export { addAsset, removeAssets, renameDesign, setVariant, MAX_DESIGN_NAME } from './document';
export { addElement, duplicateElement, removeElements, updateElement } from './elements';
export { arrangeElement, moveElementTo, type ArrangeAction } from './order';
export { DesignCommandError, findElement, getSurface } from './shared';
export { clearSurface, copySurface, resizeSurface, setBackground, transformElement, type CopyMode, type ResizeMode, type Transform } from './surfaces';
