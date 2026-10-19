import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveServerModel } from "../src/lib/server/model-provider";

const original = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
};

beforeEach(() => {
  process.env.OPENAI_API_KEY = "openai-test";
  process.env.ANTHROPIC_API_KEY = "anthropic-test";
  process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-test";
});

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

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

describe("Cryzo managed paid routing", () => {
  it("routes OpenAI paid models directly through the Cryzo OpenAI key", async () => {
    const result = await resolveServerModel({ providerId: "cryzo", modelId: "cryzo/openai-gpt-6.1-sol", credentialMode: "cryzo" });
    expect(result.model.provider).toContain("openai");
    expect(result.upstreamModelId).toBe("gpt-6.1-sol");
    expect(result.usesCryzoCredits).toBe(true);
  });

  it("routes Claude paid models directly through the Cryzo Anthropic key", async () => {
    const result = await resolveServerModel({ providerId: "cryzo", modelId: "cryzo/anthropic-claude-sonnet-5.5", credentialMode: "cryzo" });
    expect(result.model.provider).toContain("anthropic");
    expect(result.upstreamModelId).toBe("claude-sonnet-5-5");
  });

  it("routes Gemini paid models directly through the Cryzo Google key", async () => {
    const result = await resolveServerModel({ providerId: "cryzo", modelId: "cryzo/google-gemini-3.8-flash", credentialMode: "cryzo" });
    expect(result.model.provider).toContain("google");
    expect(result.upstreamModelId).toBe("gemini-3.8-flash");
  });
});

vi.mock("server-only", () => ({}));

it("rejects API keys in ChatGPT plan mode instead of falling back to managed inference",async()=>{await expect(resolveServerModel({providerId:"chatgpt",modelId:"any",credentialMode:"device",modelApiKey:"key"})).rejects.toThrow("ChatGPT connection");});
