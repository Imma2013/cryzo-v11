import { generateText } from "ai";

type Model = Parameters<typeof generateText>[0]["model"];
export type DesignPlan = { hero: string; navigation: string; typography: string; palette: string; imagery: string; sections: string[]; mobile: string };

function parseJson(text: string): any {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

/** Adapted from Cryzo v5's pre-generation design-layout-plan pipeline. */
export async function planWebsiteDesign({ model, prompt, reference }: { model: Model; prompt: string; reference?: string }) {
  const result = await generateText({
    model, maxOutputTokens: 900,
    system: `You are Cryzo's senior art director and mobile UI designer. Make ONE concrete visual composition plan before website code is written. Translate the user's actual goals into a polished, content-rich, distinctive web experience. Reference guidance is inspiration, never authorization to ignore requested style. Think in precise mobile-first constraints: 320px and 390px phone widths, 768px tablet and 1440px desktop. Design responsive collapsed navigation, intentional typography, image crops and credible spacing. Prevent horizontal overflow, unstyled inline icons and cramped controls. Output ONLY JSON: {"hero":"...","navigation":"...","typography":"...","palette":"...","imagery":"...","sections":["..."],"mobile":"..."}.`,
    prompt: `USER REQUEST:\n${prompt.slice(0, 5000)}\n\nOPTIONAL DESIGN REFERENCE:\n${(reference || "").slice(0, 3300)}`,
  });
  const draft = parseJson(result.text) as Partial<DesignPlan> | null;
  if (!draft || !draft.hero || !draft.navigation || !draft.mobile || !Array.isArray(draft.sections)) return "";
  return `\n\n## LOCKED DESIGN LAYOUT PLAN — ADAPTED FROM CRYZO V5\nDo not replace this plan with a generic stack. Implement it in working responsive code.\nHero: ${draft.hero}\nNavigation: ${draft.navigation}\nTypography: ${draft.typography || "Readable, intentional hierarchy"}\nPalette: ${draft.palette || "Purposeful contrast"}\nImagery: ${draft.imagery || "Intentional content imagery"}\nSections: ${draft.sections.join(" → ")}\nMobile composition: ${draft.mobile}\nAcceptance: no unintended horizontal scrolling at 320px/390px; collapsed mobile navigation, no clipped headings or giant icons, readable body text, deliberate spacing and image crops.\n`;
}

/** Adapted from Cryzo v5's design-audit: one bounded critique, never unlimited retries. */
export async function auditWebsiteDraft({ model, prompt, layoutPlan, draft }: { model: Model; prompt: string; layoutPlan: string; draft: string }) {
  const result = await generateText({
    model, maxOutputTokens: 600,
    system: `You audit generated React/CSS for design quality against a layout plan. Fail bland/generic, unstyled or likely mobile-breaking drafts; consider real CSS/layout code rather than wishful claims. Return only JSON: {"verdict":"pass"|"retry","critique":["precise issue", "precise fix"],"score":0-100}. Max 5 issues.`,
    prompt: `USER:\n${prompt.slice(0, 1800)}\nPLAN:\n${layoutPlan.slice(0, 3200)}\nGENERATED CODE AND FILE ACTIONS:\n${draft.slice(0, 18500)}`,
  });
  const audit = parseJson(result.text);
  if (!audit || audit.verdict !== "retry" || !Array.isArray(audit.critique)) return [] as string[];
  return audit.critique.slice(0, 5).filter((v: unknown): v is string => typeof v === "string" && v.length < 450);
}
