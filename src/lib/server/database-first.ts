import { generateText } from "ai";
import { parseDatabasePlan } from "./database-plan";
export { verifiedBackendContext } from "./database-plan";

type Model = Parameters<typeof generateText>[0]["model"];

export async function planDatabaseBeforeFrontend({ model, prompt }: { model: Model; prompt: string }) {
  const response = await generateText({
    model,
    maxOutputTokens: 1600,
    system: `You are designing the actual database FIRST for a generated web/mobile application, using managed Convex-backed Cryzo Cloud. Output ONLY valid JSON: {"name":"...","authProviders":["password"],"entities":[{"name":"Dogs","fields":{"name":"string","age":"number","breed":"string","imageUrl":"string","status":"string"},"access":"public-read","seed":[{"name":"Poppy","age":3,"breed":"Beagle","imageUrl":"https://images.unsplash.com/...","status":"available"}]}]}. Create the entities and 2-4 realistic fictional sample records needed to support the USER'S actual app, even when the user describes only the idea (e.g., dog adoption directory). Allowed field types: string, number, boolean, date, string[], number[]. Access: private for personal data, public-read for public catalogs, public only if anonymous writes are explicitly needed. Never invent real private personal data, passwords, tokens, medical records, or credential tables. Only use 0 entities for genuinely static content-only pages. Up to 8 entities and 6 records per entity. Prefer schema simplicity and no unnecessary relationship fields. Keep sample content safe and truthful; use illustrative data and stable image URLs only if reasonably appropriate. Auth is managed by Cryzo Cloud. Do not output code or markdown.`,
    prompt: `Create and seed the necessary database BEFORE generating frontend code for this user request:\n${prompt.slice(0, 4800)}`,
  });
  return parseDatabasePlan(response.text);
}

