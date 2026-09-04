import { reasoningConfig } from "../src/lib/ai/reasoning-config.ts";
import { OpenRouter } from "@openrouter/sdk";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { writeFileSync } from "node:fs";

if (!process.env.OPENROUTER_API_KEY) throw new Error("OpenRouter server key is required for smoke checks.");
const sdk = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const provider = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const freePool = new Set(["inclusionai/ling-3.0-flash-fin:free", "nvidia/nemotron-3.5-lightning:free", "nvidia/nemotron-3-ultra-550b-a55b:free"]);
const pages = await sdk.models.list({ limit: 500, outputModalities: "text" });
const models = [];
for await (const page of pages) for (const model of page.result.data) {
  if (model.id.includes(":batch") || model.id.startsWith("~") || model.id.startsWith("openrouter/")) continue;
  if (process.argv.includes("--critical-only") && !freePool.has(model.id) && model.id !== "minimax/minimax-m3") continue;
  if ((model.contextLength ?? 0) < 16000 || !model.architecture.outputModalities.includes("text")) continue;
  if (model.id.endsWith(":free") && !freePool.has(model.id)) continue;
  models.push(model);
}
// Prioritize the requested pool and current flagship families; check the rest too.
models.sort((a, b) => Number(freePool.has(b.id) || b.id.includes("minimax-m3")) - Number(freePool.has(a.id) || a.id.includes("minimax-m3")));
const report = { checkedAt: new Date().toISOString(), models: {}, totalReportedCost: 0 };
let index = 0, reservedCost = 0;
const spendingCeiling = 10;
async function worker() {
  while (index < models.length) {
    const model = models[index++];
    const estimate = 2 * (256 * Number(model.pricing.prompt) + 2048 * Number(model.pricing.completion) + Number(model.pricing.request ?? 0));
    if (!Number.isFinite(estimate) || reservedCost + estimate > spendingCeiling) {
      report.models[model.id] = { status: "unverified", reason: "Smoke-test spending ceiling" };
      continue;
    }
    reservedCost += estimate;
    const checks = [];
    try {
      for (const prompt of ["Reply with a short greeting.", "Return one complete minimal HTML document for a dog website, under 100 words. No explanation."]) {
        const started = Date.now();
        const result = streamText({
          model: provider.chat(model.id, { usage: { include: true }, ...(model.supportedParameters.includes("reasoning") ? { reasoning: reasoningConfig(model.reasoning) } : {}) }),
          prompt, maxOutputTokens: Math.min(freePool.has(model.id) ? 8192 : 2048, model.topProvider.maxCompletionTokens ?? 2048),
          maxRetries: 0, abortSignal: AbortSignal.timeout(45000), timeout: { chunkMs: 20000 }, onError: () => {},
        });
        let text = "", firstTokenMs = null;
        for await (const chunk of result.textStream) {
          if (chunk.trim() && firstTokenMs === null) firstTokenMs = Date.now() - started;
          text += chunk;
        }
        const finishReason = await result.finishReason;
        const response = await result.response;
        const metadata = await result.providerMetadata;
        const usage = await result.usage;
        const cost = metadata?.openrouter?.usage?.cost;
        if (Number.isFinite(cost)) report.totalReportedCost += cost;
        if (!text.trim() || ["error", "length"].includes(finishReason)) throw new Error("No complete streamed text: " + finishReason);
        checks.push({ firstTokenMs, finishReason, generationId: response.id, provider: metadata?.openrouter?.provider, usage, cost });
      }
      report.models[model.id] = { status: "passed", checks };
    } catch (error) {
      report.models[model.id] = { status: "failed", checks, reason: String(error.message ?? error).replace(/sk-[\w-]+/g, "[redacted]").slice(0, 250) };
    }
    console.log("[model-smoke]", model.id, report.models[model.id].status, report.models[model.id].reason ?? "");
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync("managed-model-smoke.json", JSON.stringify(report, null, 2));
console.log("[model-smoke-summary]", JSON.stringify({ models: models.length, passed: Object.values(report.models).filter(m => m.status === "passed").length, cost: report.totalReportedCost }));
if (![...freePool].some(id => report.models[id]?.status === "passed")) throw new Error("No requested free model passed real streaming checks.");
if (report.models["minimax/minimax-m3"]?.status !== "passed") throw new Error("MiniMax M3 did not pass real streaming checks.");
