export type BackendRequirements = {
  database: boolean;
  auth: boolean;
  googleAuth: boolean;
  backend: boolean;
};

export type CryzoCloudEntity = {
  name: string;
  fields?: unknown;
  access?: "private" | "public-read" | "public";
};

export type CryzoCloudResources = {
  name?: string;
  authProviders: string[];
  entities: CryzoCloudEntity[];
  functions: Array<{ name: string; config?: unknown }>;
};

type ParsedFile = { path: string; content: string };

const DATABASE_PATTERN = /\b(database|db|table|tables|persist|persistence|persistent|save\s+(?:it|this|data|records?)|stored?\s+data|crud|records?|profiles?|favorites?|favourites?|bookmarks?|comments?|posts?|orders?|inventory)\b/i;
const AUTH_PATTERN = /\b(auth|authentication|login|log\s*in|sign\s*in|signin|signup|sign\s*up|account|accounts|users?|session|sessions|password|google\s+(?:auth|login|sign[ -]?in))\b/i;
const BACKEND_PATTERN = /\b(backend|server|serverless|api\s+route|api\s+endpoint|webhook|cron|scheduled\s+job|function|functions)\b/i;

export function backendRequirementsFromPrompt(text: string): BackendRequirements {
  return {
    database: DATABASE_PATTERN.test(text),
    auth: AUTH_PATTERN.test(text),
    googleAuth: /\bgoogle\s+(?:auth|login|sign[ -]?in)\b/i.test(text),
    backend: BACKEND_PATTERN.test(text),
  };
}

function parseAttributes(value: string) {
  const result: Record<string, string> = {};
  for (const match of value.matchAll(/([A-Za-z][\w-]*)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1]] = match[3];
  }
  return result;
}

function parseGeneratedFiles(text: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const pattern = /<cryzoAction\b([^>]*)>([\s\S]*?)<\/cryzoAction>/gi;
  for (const match of text.matchAll(pattern)) {
    const attrs = parseAttributes(match[1] || "");
    if (attrs.type !== "file" || !attrs.filePath) continue;
    files.push({ path: attrs.filePath.replace(/^\/+/, ""), content: (match[2] || "").trim() });
  }
  return files;
}

function parseJson(content: string): any | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function validAccess(value: unknown): CryzoCloudEntity["access"] {
  return value === "public" || value === "public-read" || value === "private"
    ? value
    : undefined;
}

export function parseCryzoCloudResources(text: string): CryzoCloudResources {
  const resources: CryzoCloudResources = {
    authProviders: [],
    entities: [],
    functions: [],
  };
  const entityMap = new Map<string, CryzoCloudEntity>();
  const authProviders = new Set<string>();

  for (const file of parseGeneratedFiles(text)) {
    const path = file.path.toLowerCase();
    const json = parseJson(file.content);
    if (!json) continue;

    if (path === "cryzo/cloud.json") {
      if (typeof json.name === "string" && json.name.trim()) resources.name = json.name.trim();
      for (const provider of json.auth?.providers || []) {
        if (typeof provider === "string") authProviders.add(provider);
      }
      for (const entity of json.entities || []) {
        if (!entity || typeof entity.name !== "string" || !entity.name.trim()) continue;
        entityMap.set(entity.name.trim(), {
          name: entity.name.trim(),
          fields: entity.fields,
          access: validAccess(entity.access),
        });
      }
      continue;
    }

    if (/^cryzo\/entities\/[^/]+\.json$/i.test(file.path)) {
      const fallbackName = file.path.split("/").pop()!.replace(/\.json$/i, "");
      const name = typeof json.name === "string" && json.name.trim() ? json.name.trim() : fallbackName;
      entityMap.set(name, {
        name,
        fields: json.fields,
        access: validAccess(json.access),
      });
      continue;
    }

    if (path === "cryzo/auth/config.json") {
      for (const provider of json.providers || []) {
        if (typeof provider === "string") authProviders.add(provider);
      }
      continue;
    }

    if (/^cryzo\/functions\/[^/]+\.json$/i.test(file.path)) {
      const fallbackName = file.path.split("/").pop()!.replace(/\.json$/i, "");
      resources.functions.push({
        name: typeof json.name === "string" && json.name.trim() ? json.name.trim() : fallbackName,
        config: json,
      });
    }
  }

  resources.authProviders = [...authProviders];
  resources.entities = [...entityMap.values()];
  return resources;
}

export function missingBackendRequirements(
  requirements: BackendRequirements,
  resources: CryzoCloudResources,
) {
  const missing: string[] = [];
  if (requirements.database && resources.entities.length === 0) missing.push("database entities");
  if (requirements.auth && resources.authProviders.length === 0) missing.push("authentication config");
  if (requirements.googleAuth && !resources.authProviders.includes("google")) missing.push("Google authentication");
  return missing;
}

export function backendRequirementPrompt(requirements: BackendRequirements) {
  if (!requirements.database && !requirements.auth && !requirements.backend) return "";
  const required: string[] = [];
  if (requirements.database) required.push("a real database schema");
  if (requirements.auth) required.push("managed authentication");
  if (requirements.backend) required.push("the managed Cryzo Cloud backend boundary");

  return `\n\n## BACKEND REQUIREMENTS FOR THIS TURN — HARD ACCEPTANCE GATE\nThe user explicitly requested ${required.join(", ")}. Do not merely add client-side state or describe persistence. The build is incomplete until the requested Cryzo Cloud resources are emitted, applied, and usable.\n\nCryzo Cloud is PLATFORM-OWNED infrastructure powered by Cryzo's Convex backend. Generated projects do not install their own Cryzo backend package.\n\nABSOLUTE RULES:\n- NEVER add @cryzo/cloud, @cryzo/*, convex, @convex-dev/*, or any fictional Cryzo SDK to the generated app's package.json unless the user explicitly asked to bring their own Convex backend. There is currently no @cryzo/cloud npm package for generated apps.\n- NEVER fabricate a package version or backend URL.\n- Use the managed HTTPS API documented in the main system prompt and create a small local typed helper (normally src/lib/cryzo-cloud.ts) using fetch.\n- The public Cryzo Cloud app ID is not a secret; provider secrets and privileged operations stay on Cryzo's server.\n\nUse first-class Cryzo Cloud resource files:\n- Database entities: one file per entity at cryzo/entities/<EntityName>.json with { "name", "access", "fields" }.\n- Authentication: cryzo/auth/config.json with { "providers": ["password"${requirements.googleAuth ? ', "google"' : ""}] }.\n- Optional declarative backend metadata: cryzo/functions/<FunctionName>.json. Do not claim arbitrary server code is live unless the platform explicitly supports that function type.\n- cryzo/cloud.json remains supported for compatibility, but prefer the resource files above for new backend work.\n\nIf the user asks to save application data, infer useful entities from the product instead of creating an empty database. Wire the generated UI to the local Cryzo Cloud fetch helper so create/read/update/delete operations really use the managed backend. Never claim persistence is complete when no entity schema exists.`;
}

export function backendRepairPrompt(missing: string[]) {
  return `The application code was generated, but the backend acceptance gate is still missing: ${missing.join(", ")}.\nReturn ONE small additional <cryzoArtifact> containing only the missing Cryzo Cloud resource files and any local client/application files that must change to actually use them. Do not repeat unchanged files. For database work, emit at least one meaningful cryzo/entities/<EntityName>.json schema inferred from the existing app. For auth work, emit cryzo/auth/config.json. NEVER install or import @cryzo/cloud; use the managed HTTPS API through a local fetch helper. Close every action and the artifact.`;
}
