import { createOpenAI } from "@ai-sdk/openai";

const nvidia = createOpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

/**
 * Compatibility export for the existing Cryzo chat route.
 * Both former Gemini selections are intentionally routed to NVIDIA MiniMax M3.
 */
export function google(_modelId: string) {
  return nvidia.chat("minimaxai/minimax-m3");
}
