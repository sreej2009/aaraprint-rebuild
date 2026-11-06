import { CARD_TEMPLATES } from './cards';
import { PRINT_TEMPLATES } from './print-pieces';
import { SMALL_TEMPLATES } from './small-formats';

/**
 * Every template definition, in panel order. Loaded on demand (templates/registry.ts) and checked
 * before use (templates/validate.ts), so it's typed loosely here on purpose.
 *
 * The original site had 95 code-defined templates (Reconnaissance Appendix B). None of their code
 * or artwork is used: these are new layouts for the new Studio, some re-authored from an original
 * layout idea (`basedOn`). They use only shapes, text and the Studio's own OFL fonts — no
 * graphics (the M9 library has none cleared yet) and no images — so their rights are cleared.
 */
export const TEMPLATE_DEFINITIONS: readonly unknown[] = [...CARD_TEMPLATES, ...PRINT_TEMPLATES, ...SMALL_TEMPLATES];
