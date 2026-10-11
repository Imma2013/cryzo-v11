import { generateText } from "ai";
import type { DesignReferenceDoc } from "./design-reference-library";
import {
  buildDesignLayoutPlanSystemPrompt,
  buildDesignLayoutPlanUserPrompt,
  parseDesignLayoutPlan,
  buildDesignLayoutPlanBlock,
} from "./design-layout-plan";
import {
  buildDesignAuditSystemPrompt,
  buildDesignAuditUserPrompt,
  parseBuildDesignAudit,
} from "./design-audit";

type Model = Parameters<typeof generateText>[0]["model"];

/** V5 composition planning, grounded in one routed canonical reference packet. */
export async function planWebsiteDesign({ model, prompt, primaryReference, executionPacket }: {
  model: Model; prompt: string; primaryReference: DesignReferenceDoc; executionPacket: string;
}): Promise<string> {
  const result = await generateText({
    model,
    maxOutputTokens: 1400,
    system: buildDesignLayoutPlanSystemPrompt(),
    prompt: buildDesignLayoutPlanUserPrompt({
      userPrompt: prompt.slice(0, 6500),
      primarySlug: primaryReference.slug,
      executionPacket: executionPacket.slice(0, 16000),
    }),
  });
  const parsed = parseDesignLayoutPlan(result.text);
  if (!parsed) throw new Error(`V5 composition plan could not be parsed for ${primaryReference.slug}`);
  const block = buildDesignLayoutPlanBlock(parsed);
  return `${block}\n\n<mobile_design_acceptance>\nAt 320px and 390px viewport widths preserve the reference's visual identity through intentional recomposition. No clipped display text, horizontal overflow, unbalanced pills or unreadable image crops. Mobile navigation must be usable.\n</mobile_design_acceptance>`;
}

/** V5 reference-fidelity audit; reject visual drift, rather than generic niceness. */
export async function auditWebsiteDraft({ model, prompt, layoutPlan, draft, primaryReference, executionPacket }: {
  model: Model; prompt: string; layoutPlan: string; draft: string;
  primaryReference: DesignReferenceDoc; executionPacket: string;
}): Promise<{ verdict: "pass" | "retry"; critique: string[]; score: number }> {
  const result = await generateText({
    model,
    maxOutputTokens: 1024,
    system: buildDesignAuditSystemPrompt(),
    prompt: buildDesignAuditUserPrompt({
      generatedText: draft.slice(0, 24000),
      executionPacket: executionPacket.slice(0, 15000),
      layoutPlan: layoutPlan.slice(0, 5500),
      primarySlug: primaryReference.slug,
      userPrompt: prompt.slice(0, 4500),
    }),
  });
  const audit = parseBuildDesignAudit(result.text);
  if (!audit) throw new Error(`V5 design audit could not be parsed for ${primaryReference.slug}`);
  return {
    verdict: audit.verdict,
    critique: audit.verdict === "retry" ? audit.critique.slice(0, 5) : [],
    score: audit.score,
  };
}
