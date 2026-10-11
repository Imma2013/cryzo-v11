import { describe, expect, it } from 'vitest';
import { buildDesignAuditSystemPrompt, buildDesignAuditUserPrompt, parseBuildDesignAudit } from '@/lib/server/design-audit';

describe('design audit helpers', () => {
  it('builds an audit prompt with the reference slug and compiled brief', () => {
    const prompt = buildDesignAuditUserPrompt({
      generatedText: 'draft output',
      executionPacket: '<design_execution_packet slug="cryzo-10">...</design_execution_packet>',
      layoutPlan: '<design_layout_lock>...</design_layout_lock>',
      primarySlug: 'cryzo-10',
      userPrompt: 'make a website for dogs',
    });

    expect(buildDesignAuditSystemPrompt()).toContain('Return JSON only');
    expect(prompt).toContain('SELECTED PRIMARY REFERENCE:');
    expect(prompt).toContain('cryzo-10');
    expect(prompt).toContain('LOCKED LAYOUT PLAN:');
    expect(prompt).toContain('GENERATED DRAFT:');
    expect(prompt).toContain('draft output');
  });

  it('parses plain JSON audit responses', () => {
    const parsed = parseBuildDesignAudit(
      '{"verdict":"retry","compositionVerdict":"drifted","score":41,"reasons":["generic startup drift"],"critique":["Increase section tension"]}',
    );

    expect(parsed).toEqual({
      verdict: 'retry',
      compositionVerdict: 'drifted',
      score: 41,
      reasons: ['generic startup drift'],
      critique: ['Increase section tension'],
    });
  });

  it('parses fenced JSON audit responses', () => {
    const parsed = parseBuildDesignAudit(`
\`\`\`json
{"verdict":"pass","compositionVerdict":"aligned","score":88,"reasons":["reference fidelity is strong"],"critique":[]}
\`\`\`
`);

    expect(parsed).toEqual({
      verdict: 'pass',
      compositionVerdict: 'aligned',
      score: 88,
      reasons: ['reference fidelity is strong'],
      critique: [],
    });
  });

  it('returns null for malformed audit responses', () => {
    expect(parseBuildDesignAudit('not json')).toBeNull();
  });
});
