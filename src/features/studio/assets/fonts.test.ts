import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTextElement } from '../schema/create';
import { DEFAULT_TEXT_FONT, ensureFonts, faceSpec, facesFor, fontByFamily, fontCss, fontsVersion, resetFontsForTests, STUDIO_FONTS, stylePatchForFamily, subscribeFonts, supportedWeight } from './fonts';

afterEach(() => resetFontsForTests());

const text = (fields: Parameters<typeof createTextElement>[1]) => createTextElement({ x: 0, y: 0, width: 100, height: 20 }, fields);

describe('font registry', () => {
  it('offers the Studio and site fonts, with only the styles each really has', () => {
    expect(STUDIO_FONTS.map((f) => f.family)).toEqual(['Plus Jakarta Sans', 'Fraunces', 'Inter', 'Manrope']);
    expect(fontByFamily(DEFAULT_TEXT_FONT)?.category).toBe('sans-serif');
    expect(fontByFamily('Fraunces')).toMatchObject({ face: 'Fraunces Variable', category: 'serif', italic: true });
    expect(fontByFamily('Manrope')?.italic).toBe(false);
    expect(fontByFamily('Comic Sans')).toBeNull();
  });

  it('maps families to the self-hosted faces, with a safe fallback for unknown ones', () => {
    expect(fontCss('Plus Jakarta Sans')).toBe("'Plus Jakarta Sans Variable', 'Plus Jakarta Sans', sans-serif");
    expect(fontCss('Fraunces')).toBe("'Fraunces Variable', 'Fraunces', serif");
    expect(fontCss("Ari'al")).toBe("'Arial', sans-serif");
  });

  it('switches font without drawing styles the new font lacks', () => {
    expect(stylePatchForFamily({ fontWeight: 700, italic: true }, 'Manrope')).toEqual({ fontFamily: 'Manrope', fontWeight: 700, italic: false });
    expect(stylePatchForFamily({ fontWeight: 600, italic: true }, 'Fraunces')).toEqual({ fontFamily: 'Fraunces', fontWeight: 600, italic: true });
    expect(stylePatchForFamily({ fontWeight: 500, italic: true }, 'Arial')).toEqual({ fontFamily: 'Arial', fontWeight: 500, italic: true });
    expect(supportedWeight({ ...fontByFamily('Inter')!, weights: [400, 700] }, 600)).toBe(700);
    expect(supportedWeight(fontByFamily('Inter')!, 500)).toBe(500);
  });
});

describe('font loading', () => {
  it('describes the faces a design needs, with each character once', () => {
    const faces = facesFor([text({ fontFamily: 'Fraunces', fontWeight: 600, text: 'Riya' }), text({ fontFamily: 'Fraunces', fontWeight: 600, text: 'Ravi' }), text({ fontFamily: 'Inter', italic: true, text: 'Đà Nẵng' })]);
    expect(faces).toHaveLength(2);
    expect(faces[0]).toMatchObject({ family: 'Fraunces', weight: 600, italic: false, text: 'ARaivy' });
    expect(faceSpec(faces[1]!)).toBe("italic 400 16px 'Inter Variable'");
    expect(faces[1]!.text).toContain('Đ'); // the Vietnamese subset loads too
  });

  it('loads faces that are not ready, once, and bumps the version when they arrive', async () => {
    const fonts = { check: vi.fn<() => boolean>(() => false), load: vi.fn<(spec: string, text: string) => Promise<FontFace[]>>(async () => [{} as FontFace]) };
    const listener = vi.fn<() => void>();
    subscribeFonts(listener);
    const face = { family: 'Fraunces', weight: 600 as const, italic: false, text: 'Aa' };
    await Promise.all([ensureFonts([face], fonts), ensureFonts([face], fonts)]);
    expect(fonts.load).toHaveBeenCalledTimes(1);
    expect(fonts.load).toHaveBeenCalledWith("600 16px 'Fraunces Variable'", 'Aa');
    expect(fontsVersion()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('skips faces already loaded and survives failures', async () => {
    const ready = { check: vi.fn<() => boolean>(() => true), load: vi.fn<() => Promise<FontFace[]>>(async () => []) };
    await ensureFonts([{ family: 'Inter', weight: 400, italic: false, text: 'a' }], ready);
    expect(ready.load).not.toHaveBeenCalled();
    const failing = { check: () => false, load: () => Promise.reject(new Error('offline')) };
    await expect(ensureFonts([{ family: 'Inter', weight: 400, italic: false, text: 'a' }], failing)).resolves.toBeUndefined();
    expect(fontsVersion()).toBe(0);
    await expect(ensureFonts([], null)).resolves.toBeUndefined(); // no document.fonts (jsdom, old browsers)
  });
});
