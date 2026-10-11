import { describe, expect, it } from 'vitest';
import {
  buildCanonicalDesignPreamble,
  compileDesignExecutionPacket,
  formatDesignSchemeOverrides,
} from '@/lib/server/design-guidance';

const vercelProfile = {
  slug: 'vercel',
  title: 'Vercel',
  visualIntent: 'Severe minimal technical framing.',
  compositionRecipes: [
    {
      id: 'default',
      label: 'Vercel default',
      whenToUse: 'Default.',
      heroStructure: 'Technical product hero.',
      sectionOrder: ['Technical product hero', 'Platform capability band'],
      headlineImageRelationship: 'Tie the headline to the product frame.',
      layeringRules: ['Keep layering sparse and exact.'],
      typeScaleRelationship: 'Controlled headlines.',
      paletteDistribution: 'Restrained tonal palette.',
      imageFraming: 'Use crisp product surfaces.',
      asymmetry: 'Keep asymmetry restrained.',
      ctaPosture: 'Keep CTA sparse and technical.',
    },
  ],
  headlineImageRelationships: ['Tie the headline to the product frame.'],
  layeringRules: ['Keep layering sparse and exact.'],
  typeSystemBehavior: ['Keep typography exact and restrained.'],
  paletteBehavior: ['Keep accents sparse.'],
  sectionSkeletons: ['Technical product hero', 'Platform capability band'],
  antiPatterns: ['generic startup card soup'],
  allowedVariation: ['Vary product details, keep the system severe.'],
  exemplarCues: [{ id: 'hero', label: 'Technical hero', cues: ['One product frame dominates.'] }],
} as const;

describe('design guidance prompt helpers', () => {
  it('formats runtime overrides when present', () => {
    const result = formatDesignSchemeOverrides({
      palette: { primary: '#123456' },
      font: ['serif'],
      features: ['shadow'],
    });

    expect(result).toContain('FONT: ["serif"]');
    expect(result).toContain('PALETTE: {"primary":"#123456"}');
    expect(result).toContain('FEATURES: ["shadow"]');
  });

  it('omits canonical block when design.md is unavailable', () => {
    const result = buildCanonicalDesignPreamble({
      designScheme: {
        palette: { primary: '#123456' },
        font: ['serif'],
        features: ['shadow'],
      },
    });

    expect(result).not.toContain('<canonical_design_system>');
    expect(result).toContain('Optional runtime design overrides');
    expect(result).toContain('secondary hints only');
  });

  it('prioritizes the canonical design reference library over runtime overrides', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/design-recipes',
      availableReferences: ['stripe', 'vercel'],
      selectedReferences: [
        {
          slug: 'vercel',
          relativePath: 'vendor/design-recipes/vercel/DESIGN.md',
          excerpt: '# Design System\nUse editorial layouts.',
          markdown: `# Vercel

## Identity
Minimal developer platform.

## Signature Markers
- Severe minimal technical framing.
- Controlled headlines.

## Must Keep
- Keep the page crisp.

## Must Avoid
- Do not turn Vercel into Cryzo-loudness.

## Section Archetypes
- Minimal technical hero.

## Anti-Drift Fail Conditions
- the result could be mistaken for a generic AI-generated startup landing page
`,
          profile: vercelProfile as any,
        },
      ],
      selectionSource: 'canonical',
      designScheme: {
        palette: { primary: '#123456' },
        font: ['serif'],
        features: ['shadow'],
      },
    });

    expect(result).toContain('`vendor/design-recipes` is the canonical generic design reference library');
    expect(result).toContain('<design_execution_packet slug="vercel"');
    expect(result).toContain('Locked composition recipe:');
    expect(result).toContain('Hero structure: Technical product hero.');
    expect(result).toContain('Signature markers:');
    expect(result).toContain('Severe minimal technical framing.');
    expect(result).toContain('If an override conflicts with the selected design references, ignore the override');
    expect(result).toContain('LOCKED PRIMARY REFERENCE: vercel');
    expect(result).toContain('binding visual blueprint');
    expect(result).toContain('signature markers, must-keep traits, must-avoid traits, section archetypes');
  });

  it('forbids unrelated brand drift when a primary reference is selected', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/design-recipes',
      availableReferences: ['cryzo-10', 'apple'],
      selectedReferences: [
        {
          slug: 'cryzo-10',
          relativePath: 'vendor/design-recipes/cryzo-10/DESIGN.md',
          excerpt: '# Design System\nUse surreal dog-editorial composition.',
          markdown: `# Cryzo 10

## Identity
Surreal dog-editorial composition.

## Signature Markers
- Poster-like vertical chapters.
`,
          profile: {
            ...vercelProfile,
            slug: 'cryzo-10',
            title: 'Cryzo 10',
            compositionRecipes: [
              {
                ...vercelProfile.compositionRecipes[0],
                heroStructure: 'Poster-field hero with overlap.',
                headlineImageRelationship: 'Headline in front of the subject.',
              },
            ],
          } as any,
        },
      ],
      selectionSource: 'canonical',
    });

    expect(result).toContain('Do not describe the output as Apple-inspired, Stripe-inspired, Ferrari-inspired');
    expect(result).toContain('follow the primary reference and ignore the generic premium instinct');
    expect(result).toContain('Do not normalize an editorial, weird, asymmetrical, or poster-like reference into a safer startup layout.');
  });

  it('compiles canonical markdown into a structured execution packet', () => {
    const result = compileDesignExecutionPacket({
      slug: 'apple',
      relativePath: 'vendor/design-recipes/apple/DESIGN.md',
      excerpt: 'fallback excerpt',
      markdown: `# Apple

## Identity
Hardware keynote restraint.

## Signature Markers
- Quiet product staging.
- Large calm product imagery.

## Must Keep
- Keep one dominant device family.

## Must Avoid
- Do not add busy feature-card grids.

## Section Archetypes
- Hero keynote frame.

## Anti-Drift Fail Conditions
- the page reads like a generic SaaS landing page rather than a product keynote
`,
      profile: {
        ...vercelProfile,
        slug: 'apple',
        title: 'Apple',
        visualIntent: 'Hardware keynote restraint.',
        compositionRecipes: [
          {
            ...vercelProfile.compositionRecipes[0],
            heroStructure: 'Keynote hero.',
            headlineImageRelationship: 'Frame the product with quiet restraint.',
          },
        ],
      } as any,
      source: 'canonical',
    });

    expect(result.identity).toBe('Hardware keynote restraint.');
    expect(result.visualIntent).toBe('Hardware keynote restraint.');
    expect(result.primaryRecipe.heroStructure).toBe('Keynote hero.');
    expect(result.signatureMarkers).toEqual(['Quiet product staging.', 'Large calm product imagery.']);
    expect(result.mustKeep).toEqual(['Keep one dominant device family.']);
    expect(result.mustAvoid).toEqual(['Do not add busy feature-card grids.']);
    expect(result.sectionArchetypes).toEqual(['Hero keynote frame.']);
    expect(result.failConditions).toEqual([
      'the page reads like a generic SaaS landing page rather than a product keynote',
    ]);
  });

  it('labels degraded fallback mode explicitly', () => {
    const result = buildCanonicalDesignPreamble({
      libraryPath: 'vendor/design-recipes',
      availableReferences: ['apple'],
      selectedReferences: [
        {
          slug: 'apple',
          relativePath: 'vendor/design-recipes/apple/DESIGN.md',
          excerpt: '# Design System\nFallback extract.',
          profile: undefined,
        },
      ],
      selectionSource: 'fallback',
    });

    expect(result).toContain('fallback mode');
    expect(result).toContain('do not pretend this is a richer multi-reference library extract');
  });
});
