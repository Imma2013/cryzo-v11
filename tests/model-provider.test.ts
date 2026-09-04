import { describe, expect, it } from "vitest";
import { resolveServerModel } from "../src/lib/server/model-provider";

describe("BYOK provider routing", () => {
  it("uses the official OpenRouter provider and preserves exact free IDs", async () => {
    const result = await resolveServerModel({ providerId: "openrouter", modelId: "minimax/minimax-m3:free",
      credentialMode: "device", modelApiKey: "sk-or-test", modelBaseUrl: "https://openrouter.ai/api/v1" });
    expect(result.modelId).toBe("minimax/minimax-m3:free");
    expect(result.usesCryzoCredits).toBe(false);
    expect(result.model.provider).toContain("openrouter");
  });
  it("never sends an OpenRouter key to OpenAI", async () => {
    await expect(resolveServerModel({ providerId: "openai", modelId: "gpt-test", credentialMode: "device",
      modelApiKey: "sk-or-test" })).rejects.toThrow("Select OpenRouter");
  });
  it("uses native direct-provider adapters", async () => {
    const anthropic = await resolveServerModel({ providerId: "anthropic", modelId: "claude-test", credentialMode: "device", modelApiKey: "direct-test" });
    const xai = await resolveServerModel({ providerId: "xai", modelId: "grok-test", credentialMode: "device", modelApiKey: "direct-test" });
    expect(anthropic.model.provider).toContain("anthropic");
    expect(xai.model.provider).toContain("xai");
  });
});
