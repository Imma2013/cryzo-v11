import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { writeFileSync } from "node:fs";

const criticalOnly = process.argv.includes("--critical-only");
const checks = [
  { id: "nvidia/nemotron-3.5-lightning:free", provider: "openrouter", env: "OPENROUTER_API_KEY" },
  { id: "inclusionai/ling-3.0-flash-fin:free", provider: "openrouter", env: "OPENROUTER_API_KEY" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", provider: "openrouter", env: "OPENROUTER_API_KEY" },
  ...(!criticalOnly ? [
    { id: "claude-sonnet-5-5", provider: "anthropic", env: "ANTHROPIC_API_KEY" },
    { id: "claude-opus-5-5", provider: "anthropic", env: "ANTHROPIC_API_KEY" },
    { id: "claude-fable-5-1", provider: "anthropic", env: "ANTHROPIC_API_KEY" },
    { id: "gemini-3.8-flash", provider: "google", env: "GOOGLE_GENERATIVE_AI_API_KEY" },
    { id: "gpt-6.1-sol", provider: "openai", env: "OPENAI_API_KEY" },
    { id: "gpt-6-astra", provider: "openai", env: "OPENAI_API_KEY" },
    { id: "gpt-5.6-terra", provider: "openai", env: "OPENAI_API_KEY" },
  ] : []),
];

function modelFor(check, apiKey) {
  if (check.provider === "openrouter") return createOpenRouter({ apiKey }).chat(check.id, { usage: { include: true } });
  if (check.provider === "anthropic") return createAnthropic({ apiKey })(check.id);
  if (check.provider === "google") return createGoogleGenerativeAI({ apiKey })(check.id);
  return createOpenAI({ apiKey }).responses(check.id);
}

const report = { checkedAt: new Date().toISOString(), models: {} };
for (const check of checks) {
  const apiKey = process.env[check.env]?.trim();
  if (!apiKey) {
    report.models[check.id] = { status: "unconfigured", provider: check.provider, environment: check.env };
    console.log("[model-smoke]", check.id, "unconfigured", check.env);
    continue;
  }

  try {
    const started = Date.now();
    let text = "";
    let firstTokenMs = null;
    let streamError;
    const result = streamText({
      model: modelFor(check, apiKey),
      prompt: "Reply with exactly: OK",
      maxOutputTokens: 32,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(45_000),
      timeout: { chunkMs: 20_000 },
      onError: event => { streamError = event.error; },
    });
    for await (const chunk of result.textStream) {
      if (chunk.trim() && firstTokenMs === null) firstTokenMs = Date.now() - started;
      text += chunk;
    }
    const finishReason = await result.finishReason;
    if (streamError) throw streamError;
    if (!text.trim() || finishReason === "error") throw new Error("No complete streamed text: " + finishReason);
    report.models[check.id] = { status: "passed", provider: check.provider, firstTokenMs, finishReason };
  } catch (error) {
    report.models[check.id] = {
      status: "failed",
      provider: check.provider,
      reason: String(error?.message ?? error).replace(/(?:sk|AIza|nvapi)-[\w-]+/g, "[redacted]").slice(0, 300),
    };
  }
  console.log("[model-smoke]", check.id, report.models[check.id].status, report.models[check.id].reason ?? "");
}

writeFileSync("managed-model-smoke.json", JSON.stringify(report, null, 2));
const configured = Object.entries(report.models).filter(([, value]) => value.status !== "unconfigured");
const failed = configured.filter(([, value]) => value.status === "failed");
console.log("[model-smoke-summary]", JSON.stringify({ configured: configured.length, failed: failed.length }));
if (failed.length) throw new Error(`${failed.length} configured managed model smoke check(s) failed.`);
