import { describe, expect, it } from 'vitest';
import { getDesignLibraryDiagnostics, getDesignReferenceLibrary, routeDesignReferences } from '@/lib/server/design-reference-library';

describe('design system routing', () => {
  const expectPrimary = (prompt: string, slug: string) => {
    expect(routeDesignReferences(prompt).primary?.slug).toBe(slug);
  };

  it('routes phones to apple', () => {
    expectPrimary('build me a phone website', 'apple');
  });

  it('routes pets to cryzo-10', () => {
    expectPrimary('build me a dog lovers website', 'cryzo-10');
  });

  it('routes generic dog prompts to cryzo-10', () => {
    expectPrimary('make me a dog website', 'cryzo-10');
  });

  it('routes regular cars to cryzo-4', () => {
    expectPrimary('build me a regular car website', 'cryzo-4');
  });

  it('routes generic car prompts to cryzo-4', () => {
    expectPrimary('make a car website', 'cryzo-4');
  });

  it('routes luxury cars to cryzo-9', () => {
    expectPrimary('build me a luxury car website', 'cryzo-9');
  });

  it('routes books to cryzo-8', () => {
    expectPrimary('create a book publisher website', 'cryzo-8');
  });

  it('routes furniture to cryzo-3', () => {
    expectPrimary('make a furniture website for designer sofas and chairs', 'cryzo-3');
  });

  it('routes festivals to cryzo-1', () => {
    expectPrimary('make a music festival website with lineup and tickets', 'cryzo-1');
  });

  it('routes payments to stripe', () => {
    expectPrimary('create a payments platform for merchants', 'stripe');
  });

  it('routes deployment platforms to vercel', () => {
    expectPrimary('design a frontend deployment platform for developers', 'vercel');
  });

  it('routes workspaces to notion', () => {
    expectPrimary('create a knowledge workspace for teams', 'notion');
  });

  it('routes design tools to figma', () => {
    expectPrimary('make a collaborative interface design tool', 'figma');
  });

  it('routes travel marketplaces to airbnb', () => {
    expectPrimary('build a travel marketplace for stays and vacation rentals', 'airbnb');
  });

  it('routes observability to sentry', () => {
    expectPrimary('create an error tracking and observability platform', 'sentry');
  });

  it('routes terminal apps to warp', () => {
    expectPrimary('design a modern terminal app for developers', 'warp');
  });

  it('routes docs sites to mintlify', () => {
    expectPrimary('build an api docs site for developers', 'mintlify');
  });

  it('routes databases to supabase when the prompt describes app backend infra', () => {
    expectPrimary('build a postgres backend platform for app developers', 'supabase');
  });

  it('keeps pet prompts away from ferrari', () => {
    expect(routeDesignReferences('build a pet website for dog lovers').primary?.slug).not.toBe('ferrari');
  });

  it('hard-locks to a single primary design reference', () => {
    expect(routeDesignReferences('make me a dog website').supporting).toEqual([]);
  });

  it('hydrates the canonical design library for every supported slug', () => {
    const diagnostics = getDesignLibraryDiagnostics();
    const library = getDesignReferenceLibrary();

    expect(library.length).toBeGreaterThan(60);
    expect(diagnostics.canonicalCount).toBe(diagnostics.supportedSlugs.length);
    expect(diagnostics.fallbackCount).toBe(0);
    expect(diagnostics.missingCanonicalSlugs).toEqual([]);
    expect(diagnostics.missingCanonicalProfileSlugs).toEqual([]);
    expect(library.every((reference) => reference.markdown.includes('## Signature Markers'))).toBe(true);
    expect(library.every((reference) => reference.markdown.includes('## Must Keep'))).toBe(true);
    expect(library.every((reference) => reference.markdown.includes('## Must Avoid'))).toBe(true);
    expect(library.every((reference) => reference.markdown.includes('## Section Archetypes'))).toBe(true);
    expect(library.every((reference) => reference.profile.compositionRecipes.length > 0)).toBe(true);
    expect(library.every((reference) => reference.profile.exemplarCues.length > 0)).toBe(true);
  });

  it('auto-picks a best-fit primary for broad build prompts', () => {
    const result = routeDesignReferences('build me a premium website for a modern startup');

    expect(result.primary).toBeDefined();
    expect(result.primary?.slug).toBeTruthy();
    expect(result.selectionSource).toBe('canonical');
  });

  it('preserves bark-derived cryzo 10 fidelity markers in the canonical library', () => {
    const cryzo10 = getDesignReferenceLibrary().find((reference) => reference.slug === 'cryzo-10');

    expect(cryzo10?.markdown).toContain('poster-like vertical chapters');
    expect(cryzo10?.markdown).toContain('acidic giant typography');
    expect(cryzo10?.markdown).toContain('fashion-editorial dog photography');
    expect(cryzo10?.markdown).toContain('hard color-field logic');
  });
});
