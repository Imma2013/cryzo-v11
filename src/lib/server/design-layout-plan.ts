import { stripIndents } from './design-strip-indents';

export interface BuildDesignLayoutPlanInput {
  executionPacket: string;
  primarySlug: string;
  userPrompt: string;
}

export interface ParsedBuildDesignLayoutPlan {
  heroStructure: string;
  sectionSequence: string[];
  headlineImageRelationship: string;
  overlapStrategy: string;
  zIndexPlan: string[];
  typeHierarchy: string[];
  paletteBlockPlan: string[];
  imagePlacement: string[];
  ctaStrategy: string;
}

export function buildDesignLayoutPlanSystemPrompt() {
  return stripIndents`
    You create a concrete layout plan for a generated website before implementation.
    You must obey the selected design execution packet as the highest-priority source of truth.

    Rules:
    - Output one concrete composition plan, not multiple options.
    - Lock the hero architecture, section sequence, overlap behavior, and palette-field logic.
    - Do not default to generic hero/features/footer structure unless the execution packet explicitly requires it.
    - If the execution packet implies tension, overlap, poster logic, or editorial chaptering, preserve that in the plan.
    - Return JSON only. No markdown. No prose outside JSON.

    Required JSON shape:
    {"heroStructure":"...","sectionSequence":["..."],"headlineImageRelationship":"...","overlapStrategy":"...","zIndexPlan":["..."],"typeHierarchy":["..."],"paletteBlockPlan":["..."],"imagePlacement":["..."],"ctaStrategy":"..."}
  `;
}

export function buildDesignLayoutPlanUserPrompt(input: BuildDesignLayoutPlanInput) {
  return stripIndents`
    USER PROMPT:
    ${input.userPrompt}

    SELECTED PRIMARY REFERENCE:
    ${input.primarySlug}

    DESIGN EXECUTION PACKET:
    ${input.executionPacket}
  `;
}

export function buildDesignLayoutPlanBlock(plan: ParsedBuildDesignLayoutPlan) {
  return stripIndents`
    <design_layout_lock>
      The following internal layout plan is binding for this build. Implement code to match it instead of inventing a looser generic structure.

      Hero structure:
      - ${plan.heroStructure}

      Section sequence:
      ${plan.sectionSequence.map((entry) => `- ${entry}`).join('\n')}

      Headline/image relationship:
      - ${plan.headlineImageRelationship}

      Overlap strategy:
      - ${plan.overlapStrategy}

      Z-index plan:
      ${plan.zIndexPlan.map((entry) => `- ${entry}`).join('\n')}

      Type hierarchy:
      ${plan.typeHierarchy.map((entry) => `- ${entry}`).join('\n')}

      Palette block plan:
      ${plan.paletteBlockPlan.map((entry) => `- ${entry}`).join('\n')}

      Image placement:
      ${plan.imagePlacement.map((entry) => `- ${entry}`).join('\n')}

      CTA strategy:
      - ${plan.ctaStrategy}
    </design_layout_lock>
  `;
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1]?.trim() || trimmed;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  return source.slice(start, end + 1);
}

export function parseDesignLayoutPlan(text: string): ParsedBuildDesignLayoutPlan | null {
  const jsonText = extractJsonObject(text);

  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<ParsedBuildDesignLayoutPlan>;

    if (
      typeof parsed.heroStructure !== 'string' ||
      !Array.isArray(parsed.sectionSequence) ||
      typeof parsed.headlineImageRelationship !== 'string' ||
      typeof parsed.overlapStrategy !== 'string' ||
      !Array.isArray(parsed.zIndexPlan) ||
      !Array.isArray(parsed.typeHierarchy) ||
      !Array.isArray(parsed.paletteBlockPlan) ||
      !Array.isArray(parsed.imagePlacement) ||
      typeof parsed.ctaStrategy !== 'string'
    ) {
      return null;
    }

    return {
      heroStructure: parsed.heroStructure,
      sectionSequence: parsed.sectionSequence.filter((entry): entry is string => typeof entry === 'string'),
      headlineImageRelationship: parsed.headlineImageRelationship,
      overlapStrategy: parsed.overlapStrategy,
      zIndexPlan: parsed.zIndexPlan.filter((entry): entry is string => typeof entry === 'string'),
      typeHierarchy: parsed.typeHierarchy.filter((entry): entry is string => typeof entry === 'string'),
      paletteBlockPlan: parsed.paletteBlockPlan.filter((entry): entry is string => typeof entry === 'string'),
      imagePlacement: parsed.imagePlacement.filter((entry): entry is string => typeof entry === 'string'),
      ctaStrategy: parsed.ctaStrategy,
    };
  } catch {
    return null;
  }
}
