import { describe, expect, it } from "vitest";
import { providerReasoningOptions, supportedReasoningEfforts } from "@/lib/ai/reasoning-config";

describe("Model-specific reasoning controls", () => {
  it("reads actual effort values from models.dev metadata", () => {
    expect(supportedReasoningEfforts({ reasoning: true, reasoningOptions: [{ type: "effort", values: ["low", "medium", "high", "max"] }] }))
      .toEqual(["default", "low", "medium", "high", "max"]);
    expect(supportedReasoningEfforts({ reasoning: false, reasoningOptions: [{ type: "effort", values: ["high"] }] })).toEqual([]);
    expect(supportedReasoningEfforts({ reasoning: true })).toEqual([]);
    expect(supportedReasoningEfforts({ reasoning: true, reasoningOptions: [{ type: "toggle" }] })).toEqual([]);
  });
  it("uses OpenRouter supportedEfforts for Cryzo managed models", () => {
    expect(supportedReasoningEfforts({ reasoning: true, reasoningOptions: { supportedEfforts: ["low", "high"] } }))
      .toEqual(["default", "low", "high"]);
  });
  it("passes real provider reasoning arguments, never fabricated defaults", () => {
    expect(providerReasoningOptions("openai", "gpt-6", "high")).toEqual({ openai: { reasoningEffort: "high" } });
    expect(providerReasoningOptions("cryzo", "cryzo/reasoning-model", "high")).toEqual({ openrouter: { reasoning: { effort: "high" } } });
    expect(providerReasoningOptions("openrouter", "openai/gpt", "none")).toEqual({ openrouter: { reasoning: { enabled: false } } });
    expect(providerReasoningOptions("anthropic", "claude-opus-4-6", "high")).toEqual({ anthropic: { thinking: { type: "adaptive" }, effort: "high" } });
    expect(providerReasoningOptions("google", "gemini-3-pro", "high")).toEqual({ google: { thinkingConfig: { thinkingLevel: "high" } } });
  });
  it("falls back to model defaults for absent and unsupported levels", () => {
    expect(providerReasoningOptions("openai", "gpt", "default")).toBeUndefined();
    expect(providerReasoningOptions("openrouter", "gpt", "max")).toBeUndefined();
    expect(providerReasoningOptions("mistral", "mistral-large", "high")).toBeUndefined();
    expect(providerReasoningOptions("openai", "gpt", "made-up")).toBeUndefined();
  });
});
