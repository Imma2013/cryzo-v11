import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";

const mock = vi.hoisted(() => ({
  responses: [] as Array<{ text?: string; error?: string; finish?: string; reasoning?: boolean }>,
  settlements: [] as Array<{ success: boolean; costMicros: number }>,
  usedModels: [] as string[],
  duplicate: false,
}));
vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    setAuth() {}
    async query(ref: unknown) {
      const name = getFunctionName(ref as never);
      if (name === "users:currentUser") return { _id: "user" };
      if (name === "artifacts:listByConversation") return [];
      if (name === "conversations:get") return { projectPlatforms: ["web"] };
      if (name === "aiUsage:balance") return { plan: "starter", remainingMicros: 10000000 };
      return true;
    }
    async mutation(ref: unknown, args: Record<string, unknown>) {
      const name = getFunctionName(ref as never);
      if (name === "aiUsage:settle") mock.settlements.push(args as never);
      if (name === "aiUsage:reserve" && mock.duplicate) throw new Error("request_already_completed");
      return name === "cloudAdmin:ensureForConversation" ? { appId: "app" } : "run";
    }
  },
}));
vi.mock("@/lib/server/model-provider", () => ({
  resolveServerModel: async (args: { modelId: string }) => ({
    model: args.modelId, modelId: args.modelId, providerId: "cryzo", supportsTools: true, minimumPlan: "starter", billingTier: "premium",
  }),
}));
vi.mock("@/lib/server/openrouter", () => ({
  managedCandidates: async () => ["requested", "fallback"].map(id => ({ id, name: id, context: 1000000, output: 8192, inputCost: 0.000001, outputCost: 0.000001, requestCost: 0, tier: "premium" })),
  markModelUnhealthy: vi.fn(),
  openRouterClient: () => ({ generations: { getGeneration: async () => ({ data: { totalCost: 0.001 } }) } }),
}));
vi.mock("ai", async importOriginal => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    streamText: (options: { model: string }) => {
      mock.usedModels.push(options.model);
      const response = mock.responses.shift() ?? { error: "503 unavailable" };
      return {
        finishReason: Promise.resolve(response.finish ?? "stop"),
        totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
        steps: Promise.resolve([{ response: { id: "gen-test" }, providerMetadata: { openrouter: { usage: { cost: 0.001 }, provider: "test" } } }]),
        toUIMessageStream: () => new ReadableStream({
          start(controller) {
            if (response.reasoning) {
              controller.enqueue({ type: "reasoning-start", id: "reason" });
              controller.enqueue({ type: "reasoning-delta", id: "reason", delta: "reasoning" });
              controller.enqueue({ type: "reasoning-end", id: "reason" });
            }
            if (response.error) controller.enqueue({ type: "error", errorText: response.error });
            if (response.text) {
              controller.enqueue({ type: "text-start", id: "text" });
              controller.enqueue({ type: "text-delta", id: "text", delta: response.text });
              controller.enqueue({ type: "text-end", id: "text" });
            }
            controller.close();
          },
        }),
      };
    },
  };
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://test.convex.cloud");
  vi.stubEnv("CRYZO_INTERNAL_API_SECRET", "test");
  mock.responses.length = 0; mock.settlements.length = 0; mock.usedModels.length = 0; mock.duplicate = false;
});
afterEach(() => vi.unstubAllEnvs());
async function call(signal?: AbortSignal) {
  const { POST } = await import("../src/app/api/chat/route");
  return POST(new Request("http://localhost/api/chat", {
    method: "POST", signal, body: JSON.stringify({
      authToken: "test", conversationId: "project", modelProvider: "cryzo", modelId: "requested", chatMode: "plan",
      messages: [{ id: "message", role: "user", parts: [{ type: "text", text: "Make a website for dogs" }] }],
    }),
  }));
}
describe("chat stream lifecycle", () => {
  it("streams text and charges only the reported successful cost", async () => {
    mock.responses.push({ text: "Hello" });
    const body = await (await call()).text();
    expect(body).toContain("Hello");
    expect(body).toContain('"status":"completed"');
    expect(mock.settlements).toMatchObject([{ success: true, costMicros: 1000 }]);
  });
  it("accepts reasoning-first output when visible text follows", async () => {
    mock.responses.push({ reasoning: true, text: "The answer" });
    expect(await (await call()).text()).toContain("The answer");
    expect(mock.settlements[0].success).toBe(true);
  });
  it("retries once, falls back, and discloses the actual model", async () => {
    mock.responses.push({ error: "429 rate limited" }, { error: "503 unavailable" }, { text: "Fallback answer" });
    const body = await (await call()).text();
    expect(mock.usedModels).toEqual(["requested", "requested", "fallback"]);
    expect(body).toContain('"actualModelId":"fallback"');
    expect(body).toContain('"fallbackUsed":true');
  });
  it("never finishes an empty answer as success or charges for it", async () => {
    mock.responses.push({}, {}, {});
    const body = await (await call()).text();
    expect(body).toContain('"type":"error"');
    expect(body).not.toContain('"status":"completed"');
    expect(mock.settlements).toMatchObject([{ success: false, costMicros: 0 }]);
  });
  it("does not retry a truncated partial answer or charge it", async () => {
    mock.responses.push({ text: "Incomplete", finish: "length" });
    expect(await (await call()).text()).toContain('"type":"error"');
    expect(mock.usedModels).toHaveLength(1);
    expect(mock.settlements[0].success).toBe(false);
  });
  it("releases reservations when cancelled", async () => {
    const abort = new AbortController(); abort.abort();
    expect(await (await call(abort.signal)).text()).toContain('"type":"error"');
    expect(mock.usedModels).toHaveLength(0);
    expect(mock.settlements[0].success).toBe(false);
  });
  it("rejects a completed duplicate before contacting a model", async () => {
    mock.duplicate = true;
    expect((await call()).status).toBe(409);
    expect(mock.usedModels).toHaveLength(0);
    expect(mock.settlements).toHaveLength(0);
  });
});
