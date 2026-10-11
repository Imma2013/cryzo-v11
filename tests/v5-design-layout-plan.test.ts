import { describe, expect, it } from 'vitest';
import {
  buildDesignLayoutPlanBlock,
  buildDesignLayoutPlanSystemPrompt,
  buildDesignLayoutPlanUserPrompt,
  parseDesignLayoutPlan,
} from '@/lib/server/design-layout-plan';

describe('design layout plan helpers', () => {
  it('builds a layout-plan prompt with execution packet context', () => {
    const prompt = buildDesignLayoutPlanUserPrompt({
      executionPacket: '<design_execution_packet slug="cryzo-10">...</design_execution_packet>',
      primarySlug: 'cryzo-10',
      userPrompt: 'make a website for dogs',
    });

    expect(buildDesignLayoutPlanSystemPrompt()).toContain('Return JSON only');
    expect(prompt).toContain('SELECTED PRIMARY REFERENCE:');
    expect(prompt).toContain('cryzo-10');
    expect(prompt).toContain('DESIGN EXECUTION PACKET:');
  });

  it('parses strict JSON layout plans', () => {
    const parsed = parseDesignLayoutPlan(
      '{"heroStructure":"Poster field hero","sectionSequence":["Poster hero","Manifesto chapter"],"headlineImageRelationship":"Headline in front of subject","overlapStrategy":"Type overlaps hero image","zIndexPlan":["type above image"],"typeHierarchy":["giant display first"],"paletteBlockPlan":["acid yellow field"],"imagePlacement":["one dominant hero image"],"ctaStrategy":"Sparse poster CTA"}',
    );

    expect(parsed).toEqual({
      heroStructure: 'Poster field hero',
      sectionSequence: ['Poster hero', 'Manifesto chapter'],
      headlineImageRelationship: 'Headline in front of subject',
      overlapStrategy: 'Type overlaps hero image',
      zIndexPlan: ['type above image'],
      typeHierarchy: ['giant display first'],
      paletteBlockPlan: ['acid yellow field'],
      imagePlacement: ['one dominant hero image'],
      ctaStrategy: 'Sparse poster CTA',
    });
  });

  it('renders a layout-lock block for the main generation step', () => {
    const block = buildDesignLayoutPlanBlock({
      heroStructure: 'Poster field hero',
      sectionSequence: ['Poster hero'],
      headlineImageRelationship: 'Headline in front of subject',
      overlapStrategy: 'Type overlaps hero image',
      zIndexPlan: ['type above image'],
      typeHierarchy: ['giant display first'],
      paletteBlockPlan: ['acid yellow field'],
      imagePlacement: ['one dominant hero image'],
      ctaStrategy: 'Sparse poster CTA',
    });

    expect(block).toContain('<design_layout_lock>');
    expect(block).toContain('Headline/image relationship:');
    expect(block).toContain('Type overlaps hero image');
  });

  it('returns null for malformed layout-plan responses', () => {
    expect(parseDesignLayoutPlan('not json')).toBeNull();
  });
});
