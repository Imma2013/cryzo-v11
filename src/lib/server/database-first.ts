import { generateText } from "ai";
import { parseDatabasePlan } from "./database-plan";
export { verifiedBackendContext } from "./database-plan";

type Model = Parameters<typeof generateText>[0]["model"];

const PERSISTENCE_SIGNAL =
  /\b(?:sign[ -]?up|sign[ -]?in|login|log in|account|profile|auth|database|backend|save|saved|favorite|bookmark|cart|checkout|order|inventory|catalog|product|book|listing|marketplace|booking|reservation|appointment|application|comment|review|message|chat|post|feed|follow|friend|like|notification|upload|dashboard|admin|schedule|calendar|form|submit|payment|subscription|user data|history)\b/i;
const STATIC_SIGNAL =
  /\b(?:landing page|brochure|portfolio|static site|marketing page|coming soon|single page|informational page)\b/i;

/** Deterministic first-pass classifier so a dynamic app cannot silently skip its DB. */
export function projectNeedsDatabase(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();
  if (!normalized) return false;
  if (PERSISTENCE_SIGNAL.test(normalized)) return true;
  if (STATIC_SIGNAL.test(normalized)) return false;
  return /\b(?:app|platform|store|shop|social network|community|directory|tracker|crm|cms)\b/i.test(
    normalized,
  );
}

export async function planDatabaseBeforeFrontend({
  model,
  prompt,
  requireEntities = false,
}: {
  model: Model;
  prompt: string;
  requireEntities?: boolean;
}) {
  const system = [
    "You are designing the actual database FIRST for a generated web/mobile application, using managed Convex-backed Cryzo Cloud.",
    'Output ONLY valid JSON: {"name":"...","authProviders":["password"],"entities":[{"name":"Dogs","fields":{"name":"string","age":"number","breed":"string","imageUrl":"string","status":"string"},"access":"public-read","seed":[{"name":"Poppy","age":3,"breed":"Beagle","imageUrl":"https://images.unsplash.com/...","status":"available"}]}]}.',
    "Create the entities and 2-4 realistic fictional sample records needed to support the USER'S actual app, even when the user describes only the idea.",
    "Allowed field types: string, number, boolean, date, string[], number[].",
    "Access: private for personal data, public-read for public catalogs, public only if anonymous writes are explicitly needed.",
    "Never invent real private personal data, passwords, tokens, medical records, or credential tables.",
    "For bookstores, book websites, online libraries, shops, catalogs, and inventories ALWAYS create a real Books or Products catalog plus 2-4 realistic public seed rows.",
    "Create other entities when requested. Only use 0 entities for genuinely static content-only pages.",
    "Up to 8 entities and 6 records per entity. Prefer schema simplicity and no unnecessary relationship fields.",
    "Keep sample content safe and truthful. Auth is managed by Cryzo Cloud. Do not output code or markdown.",
  ].join(" ");

  const run = async (extra = "") => {
    const response = await generateText({
      model,
      maxOutputTokens: 1600,
      system,
      prompt:
        "Create and seed the necessary database BEFORE generating frontend code for this user request:\n" +
        prompt.slice(0, 4800) +
        extra,
    });
    return parseDatabasePlan(response.text);
  };

  let plan = await run(
    requireEntities
      ? "\nThis request REQUIRES persistent application data. Returning zero entities is invalid."
      : "",
  );
  if (requireEntities && !plan.entities.length) {
    plan = await run(
      "\nThe previous attempt incorrectly returned zero entities. Define the minimal real schema required by this dynamic application now.",
    );
  }
  return plan;
}
