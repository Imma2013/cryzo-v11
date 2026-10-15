import { generateText } from "ai";
import { parseDatabasePlan } from "./database-plan";
export { verifiedBackendContext } from "./database-plan";

type Model = Parameters<typeof generateText>[0]["model"];

export class DatabasePlanValidationError extends Error {
  constructor(message: string) { super(message); this.name = "DatabasePlanValidationError"; }
}

export class DatabasePlanProviderError extends Error {
  constructor(cause: unknown) {
    super("The selected model could not complete database planning.", { cause });
    this.name = "DatabasePlanProviderError";
  }
}

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
    "Create entities for the USER'S actual app. Add 2-4 fictional seed records ONLY to public catalogs or public-read content entities.",
    "Private entities MUST have seed: []. Orders, payments, bookings, messages and personal records start empty and get an authenticated owner at runtime. Never change private data to public in order to seed it.",
    "Allowed field types: string, number, boolean, date, string[], number[].",
    "Access: private for personal data, public-read for public catalogs, public only if anonymous writes are explicitly needed.",
    "Never invent real private personal data, passwords, tokens, medical records, or credential tables.",
    "For bookstores, book websites, online libraries, shops, catalogs, and inventories ALWAYS create a real Books or Products catalog plus 2-4 realistic public seed rows.",
    requireEntities
      ? "This build is database-first. Return at least one useful entity. If the site has no obvious application data, create a small SiteContent or ContentBlocks entity with safe seed content so the frontend is still backed by real data."
      : "Create other entities when requested. Zero entities are allowed only when the caller explicitly does not require a database.",
    "Up to 8 entities and 6 records per entity. Prefer schema simplicity and no unnecessary relationship fields.",
    "Keep sample content safe and truthful. Auth is managed by Cryzo Cloud. Do not output code or markdown.",
  ].join(" ");

  let previousOutput = "";
  const run = async (extra = "") => {
    const response = await generateText({
      model,
      maxOutputTokens: 1600,
      system,
      prompt:
        "Create and seed the necessary database BEFORE generating frontend code for this user request:\n" +
        prompt.slice(0, 4800) +
        extra,
    }).catch(error => { throw new DatabasePlanProviderError(error); });
    previousOutput = response.text;
    return response.text;
  };

  let repair = requireEntities ? "\nReturn at least one useful entity." : "";
  for (let attempt = 0; attempt < 2; attempt++) {
    // Provider/authentication errors are not plan validation failures.
    const text = await run(repair);
    try {
      const plan = parseDatabasePlan(text);
      if (requireEntities && !plan.entities.length) throw new Error("At least one entity is required.");
      return plan;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Invalid database plan";
      if (attempt === 1) throw new DatabasePlanValidationError(detail);
      repair = `\nRepair the previous plan. Validation error: ${detail.slice(0, 700)}. Preserve ownership rules; private entities must have empty seed arrays. Return corrected JSON only.\nPrevious plan:\n${previousOutput.slice(0, 8000)}`;
    }
  }
  throw new DatabasePlanValidationError("Unable to validate the database plan.");
}
