import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { familyIdForSlug, productWorkflow, registeredSlugs } from '@/features/product-workflow/registry';
import { PRODUCT_FAMILY_IDS, type ProductFamilyId } from '@/features/product-workflow/types';
import type { StudioProfile } from '../profile/types';
import { resolveWorkspace, workspaceNote, type StudioWorkspace } from './workspace';

/**
 * Workspace resolution (Phase 4 M4): from the design's persisted family (or, for a design saved
 * before it recorded one, the registry's family for its slug), never from URL lists. Checked for
 * every family and every registered product, with the real Studio profiles.
 */

const studioDir = path.resolve('public/api/v1/studio');
const profiles = new Map(fs.readdirSync(studioDir).map((f) => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(studioDir, f), 'utf8')) as StudioProfile]));
const withPhoto = { productView: { family: 'umbrellas' } } as unknown as Pick<StudioProfile, 'productView'>;
const noPhoto = { productView: undefined } as Pick<StudioProfile, 'productView'>;

const slugsOf = (family: ProductFamilyId) => registeredSlugs().filter((slug) => familyIdForSlug(slug) === family);
const resolve = (slug: string, profile: Pick<StudioProfile, 'productView'> | null = profiles.get(slug) ?? null, familyId: ProductFamilyId | null = familyIdForSlug(slug)) =>
  resolveWorkspace({ slug, familyId }, profile);

const PHOTO_FRAME: ProductFamilyId[] = ['umbrella', 'rainwear', 'drinkware', 'pen', 'mug'];
const FLAT: ProductFamilyId[] = ['visiting-card', 'stationery', 'letterhead', 'invitation', 'envelope', 'notebook', 'folder', 'mouse-pad'];

describe('every family', () => {
  it.each(PRODUCT_FAMILY_IDS.map((id) => [id]))('%s resolves to its registry workspace for each of its products', (family) => {
    const slugs = slugsOf(family);
    expect(slugs.length, family).toBeGreaterThan(0);
    for (const slug of slugs) {
      const workflow = productWorkflow(slug)!;
      const ws = resolve(slug);
      expect(ws.familyId).toBe(family);
      expect(ws.workflow?.family.id).toBe(family);
      expect(ws.kind).toBe(workflow.initialStudio.workspace);
      expect(ws.initialTool).toBe(workflow.initialStudio.tool);
      expect(ws.singleSurface).toBe(workflow.surfaces.length === 1);
      // The product is shown only where it can be: otherwise the flat print area, never a guess.
      expect(ws.initialView).toBe(ws.representation === 'product-photo' ? 'product' : 'flat');
      expect(ws.toggle).toBe(ws.representation === 'product-photo');
    }
  });

  it('photo-frame families open on the product photo when the profile has the original’s placements', () => {
    for (const family of PHOTO_FRAME) {
      const slug = slugsOf(family)[0]!;
      const ws = resolve(slug, withPhoto);
      expect([family, ws.kind, ws.representation, ws.initialView, ws.toggle]).toEqual([family, 'photo-frame', 'product-photo', 'product', true]);
      expect(ws.initialTool).toBe('product-options');
      // Without placements (e.g. the paper pen): flat print area, said plainly.
      const flat = resolve(slug, noPhoto);
      expect([flat.representation, flat.initialView, flat.toggle]).toEqual(['not-imported', 'flat', false]);
      expect(workspaceNote(flat, false, false)).toMatch(/isn’t available yet/);
    }
  });

  it('perspective, gift-frame and polo families keep their registry views but open flat until their geometry is imported', () => {
    const cases: [ProductFamilyId, StudioWorkspace['kind'], string][] = [
      ['marketing-print', 'perspective', 'Flat artwork'],
      ['packaging', 'perspective', 'Flat artwork'],
      ['stamp', 'perspective', 'Seal design'],
      ['gift-frame', 'gift-frame', 'Flat'],
      ['polo', 'polo-stage', 'Flat'],
    ];
    for (const [family, kind, flatLabel] of cases) {
      const ws = resolve(slugsOf(family)[0]!, withPhoto);
      expect([family, ws.kind, ws.representation, ws.initialView, ws.toggle, ws.flatLabel]).toEqual([family, kind, 'not-imported', 'flat', false, flatLabel]);
      expect(workspaceNote(ws, false, false)).toBe('On-product view for this product isn’t available yet: you’re designing the flat print area.');
    }
    expect(resolve(slugsOf('marketing-print')[0]!).views).toEqual(['product', 'flat']);
  });

  it('flat print families design on the print area, with no switch and no note', () => {
    for (const family of FLAT) {
      const ws = resolve(slugsOf(family)[0]!, withPhoto);
      expect([family, ws.kind, ws.representation, ws.initialView, ws.toggle]).toEqual([family, 'flat', 'none', 'flat', false]);
      expect(workspaceNote(ws, false, false)).toBeNull();
    }
    expect(resolve('business-card-classic').initialTool).toBe('text');
    expect(slugsOf('letterhead').map((slug) => resolve(slug).initialTool)).toEqual(slugsOf('letterhead').map(() => 'uploads'));
    expect(resolve(slugsOf('letterhead')[0]!).singleSurface).toBe(true);
  });
});

describe('fails safe', () => {
  it('an unknown product gets the plain flat print area', () => {
    const ws = resolveWorkspace({ slug: 'not-a-product', familyId: null }, withPhoto);
    expect(ws).toMatchObject({ familyId: null, workflow: null, kind: 'flat', views: ['flat'], initialView: 'flat', representation: 'none', toggle: false, singleSurface: false });
    expect(workspaceNote(ws, false, false)).toBeNull();
  });

  it('a design whose family doesn’t match its product is not trusted: flat, nothing assumed', () => {
    const ws = resolveWorkspace({ slug: 'umbrella-golf', familyId: 'mug' }, withPhoto);
    expect(ws).toMatchObject({ workflow: null, kind: 'flat', representation: 'none', toggle: false });
  });

  it('a design saved before it recorded a family uses the registry’s family for its product', () => {
    expect(resolveWorkspace({ slug: 'umbrella-golf', familyId: null }, withPhoto)).toMatchObject({ familyId: 'umbrella', kind: 'photo-frame', initialView: 'product' });
  });

  it('a null profile never shows a product photo', () => {
    expect(resolveWorkspace({ slug: 'umbrella-golf', familyId: 'umbrella' }, null)).toMatchObject({ representation: 'not-imported', initialView: 'flat', toggle: false });
  });
});

describe('notes', () => {
  it('say nothing while the product is shown; say why when the photo can’t be used here', () => {
    const ws = resolve('umbrella-golf', withPhoto);
    expect(workspaceNote(ws, true, true)).toBeNull();
    expect(workspaceNote(ws, false, true)).toBeNull(); // chose Flat themselves
    expect(workspaceNote(ws, false, false)).toBe('The product photo isn’t available here: you’re designing the flat print area.');
  });
});
