/** One normalized reasoning-effort contract for model catalog, UI and requests. */
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = "default" | (typeof REASONING_EFFORTS)[number];

export type ReasoningMetadata = {
  reasoning?: boolean;
  reasoningOptions?: unknown;
};

/** Models.dev `reasoning_options` and OpenRouter supportedEfforts have
 * provider-defined values. Never synthesize extra unsupported tiers. */
export function supportedReasoningEfforts(info?: ReasoningMetadata): ReasoningEffort[] {
  if (!info?.reasoning) return [];
  const raw = info.reasoningOptions;
  const found: string[] = [];
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (item?.type === "effort" && Array.isArray(item.values)) found.push(...item.values);
      // Boolean toggle alone is not proof of configurable reasoning effort.
    }
  } else if (raw && typeof raw === "object") {
    const source = raw as Record<string, unknown>;
    const efforts = source.supportedEfforts ?? source.supported_efforts ?? source.values;
    if (Array.isArray(efforts)) found.push(...efforts.filter((x): x is string => typeof x === "string"));
  }
  const allowed = REASONING_EFFORTS.filter(value => found.includes(value));
  return allowed.length ? ["default", ...allowed] : []; // unavailable metadata: native default only
}

/** Provider-specific AI SDK options, applied to every request step. */
export function providerReasoningOptions(providerId: string, modelId: string, effort?: string | null):
  Record<string, Record<string, any>> | undefined {
  if (!effort || effort === "default" || !REASONING_EFFORTS.some(value => value === effort)) return undefined;

  const effectiveProviderId = providerId === "cryzo"
    ? /^gpt-/i.test(modelId)
      ? "openai"
      : /^claude-/i.test(modelId)
        ? "anthropic"
        : /^gemini-/i.test(modelId)
          ? "google"
          : "openrouter"
    : providerId;

  if (effectiveProviderId === "openrouter") {
    if (effort === "none") return { openrouter: { reasoning: { enabled: false } } };
    if (effort === "max" || effort === "minimal") return undefined;
    return { openrouter: { reasoning: { effort } } };
  }
  if (effectiveProviderId === "openai") return { openai: { reasoningEffort: effort } };
  if (effectiveProviderId === "anthropic") {
    if (effort === "none" || effort === "minimal") return undefined;
    const modern = /claude-(?:sonnet|opus)-4-[6-9]|claude-(?:sonnet|opus|fable)-5/i.test(modelId);
    const budgets: Record<string, number> = { low: 2048, medium: 8192, high: 16384, max: 24576 };
    return modern
      ? { anthropic: { thinking: { type: "adaptive" }, effort } }
      : { anthropic: { thinking: { type: "enabled", budgetTokens: budgets[effort] ?? 8192 } } };
  }
  if (effectiveProviderId === "google") {
    if (/gemini-3|gemini-4/i.test(modelId)) {
      if (effort === "minimal" || effort === "xhigh" || effort === "max") return undefined;
      return { google: { thinkingConfig: { thinkingLevel: effort === "none" ? "minimal" : effort } } };
    }
    if (effort === "max" || effort === "xhigh" || effort === "minimal") return undefined;
    const budgets: Record<string, number> = { none: 0, low: 1024, medium: 4096, high: 8192 };
    return { google: { thinkingConfig: { thinkingBudget: budgets[effort] ?? 4096 } } };
  }
  if (effectiveProviderId === "xai" && ["low", "medium", "high"].includes(effort)) return { xai: { reasoningEffort: effort } };
  return undefined;
}

/** Keep compatibility with previous automatic reasoning helper callers. */
export function reasoningConfig(info?: { supportsMaxTokens?: boolean; supportedEfforts?: (string | null)[] | null; mandatory?: boolean }) {
  if (!info) return undefined;
  if (info.supportsMaxTokens) return { max_tokens: 1024 };
  const supported = supportedReasoningEfforts({ reasoning: true, reasoningOptions: { supportedEfforts: info.supportedEfforts } });
  const first = supported.find(x => x !== "default" && x !== "none");
  if (first) return { effort: first };
  if (!info.mandatory) return { enabled: false, effort: "none" as const };
  return undefined;
}
