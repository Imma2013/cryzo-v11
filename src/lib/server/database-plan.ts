export type DatabaseEntityPlan = {
  name: string;
  fields: Record<string, string>;
  access: "private" | "public-read" | "public";
  seed: Record<string, unknown>[];
};
export type DatabasePlan = {
  name: string;
  authProviders: ("password" | "google")[];
  entities: DatabaseEntityPlan[];
};

const ENTITY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,47}$/;
const FIELD_TYPES = new Set(["string", "number", "boolean", "date", "string[]", "number[]"]);
const MAX_ENTITIES = 8;
const MAX_SEED = 6;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(candidate);
}

/** Fail closed on malformed plans. A schema must not silently become a dummy table. */
export function parseDatabasePlan(text: string): DatabasePlan {
  const input = extractJson(text) as Record<string, unknown>;
  if (!input || typeof input !== "object" || !Array.isArray(input.entities)) {
    throw new Error("Database planner did not return valid entities");
  }
  if (input.entities.length > MAX_ENTITIES) throw new Error("Database plan exceeds entity limit");
  const names = new Set<string>();
  const entities: DatabaseEntityPlan[] = input.entities.map((raw: unknown) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid database entity");
    const entity = raw as Record<string, unknown>;
    const name = entity.name;
    if (typeof name !== "string" || !ENTITY_NAME.test(name) || names.has(name)) {
      throw new Error("Invalid or duplicate entity name in database plan");
    }
    names.add(name);
    const fields = entity.fields;
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new Error(`Missing fields for ${name}`);
    }
    const validatedFields: Record<string, string> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (!FIELD_NAME.test(key) || !FIELD_TYPES.has(String(value))) {
        throw new Error(`Invalid field ${name}.${key}`);
      }
      validatedFields[key] = String(value);
    }
    if (!Object.keys(validatedFields).length || Object.keys(validatedFields).length > 24) {
      throw new Error(`Invalid number of fields for ${name}`);
    }
    const access = entity.access === "public" || entity.access === "public-read" ? entity.access : "private";
    const seeds = Array.isArray(entity.seed) ? entity.seed : [];
    if (seeds.length > MAX_SEED) throw new Error(`Too many sample records for ${name}`);
    if (access === "private" && seeds.length) throw new Error(`Private entity ${name} cannot contain unowned sample records`);
    const seed: Record<string, unknown>[] = seeds.map((record) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Invalid sample record in ${name}`);
      const value = record as Record<string, unknown>;
      if (Object.keys(value).some((key) => !Object.prototype.hasOwnProperty.call(validatedFields, key))) {
        throw new Error(`Sample record includes undeclared fields in ${name}`);
      }
      for (const [key, item] of Object.entries(value)) {
        const type = validatedFields[key];
        const valid = type === "string" || type === "date" ? typeof item === "string"
          : type === "number" ? typeof item === "number" && Number.isFinite(item)
          : type === "boolean" ? typeof item === "boolean"
          : type === "string[]" ? Array.isArray(item) && item.every((v) => typeof v === "string")
          : type === "number[]" ? Array.isArray(item) && item.every((v) => typeof v === "number" && Number.isFinite(v))
          : false;
        if (!valid) throw new Error(`Sample record field ${name}.${key} does not match ${type}`);
      }
      if (JSON.stringify(value).length > 5000) throw new Error(`Sample record too large in ${name}`);
      return value;
    });
    return { name, fields: validatedFields, access, seed };
  });
  const authProviders: ("password" | "google")[] = ["password"];
  if (Array.isArray(input.authProviders) && input.authProviders.includes("google")) authProviders.push("google");
  return { name: String(input.name || "Cryzo app").slice(0, 80), authProviders, entities };
}

export function verifiedBackendContext(plan: DatabasePlan, appId: string): string {
  const entities = plan.entities.map(({ name, fields, access, seed }) => ({ name, fields, access, seededRecords: seed.length }));
  return `\n\n## ALREADY PROVISIONED BACKEND — REQUIRED FOR THIS BUILD\nCryzo Cloud appId: ${appId}. Convex has ALREADY created and verified the following app-scoped schemas and sample records BEFORE UI generation:\n${JSON.stringify({ entities, authProviders: plan.authProviders }, null, 2)}\nDo NOT create a different fake database or switch to Supabase. Build the frontend against THESE exact entity names/field names via the Cryzo Cloud client (/api/cloud/v1). Emit cryzo/cloud.json with these verified schema definitions so source files and live backend remain synchronized. Use the actual database list/get/create/update/delete operations for dynamic screens, rather than hardcoding sample data as local arrays. Do not emit duplicate seed mutations; sample records already exist.\n`;
}
