export const DEVELOPER_CONNECTION_KEYS = {
  github: "cryzo:github-token",
  vercel: "cryzo:vercel-token",
  netlify: "cryzo:netlify-token",
  supabase: "cryzo:supabase-token",
  expo: "cryzo:expo-token",
} as const;

const SUPABASE_PROJECT_KEY = "cryzo:supabase-project";
const SUPABASE_PROJECT_PREFIX = "cryzo:supabase-project:";
const RESERVED_CHAT_ROUTES = new Set([
  "apps",
  "billing",
  "cloud",
  "login",
  "settings",
]);

export type DeveloperConnection = keyof typeof DEVELOPER_CONNECTION_KEYS;

export type SupabaseProjectSelection = {
  ref: string;
  name: string;
  url: string;
  publicKey: string;
};

function activeConversationId() {
  if (typeof window === "undefined") return "";
  const match = window.location.pathname.match(/^\/chat\/([^/]+)\/?$/);
  const candidate = match?.[1] || "";
  return candidate && !RESERVED_CHAT_ROUTES.has(candidate) ? candidate : "";
}

function projectStorageKey(conversationId?: string | null) {
  const id = conversationId?.trim() || activeConversationId();
  return id ? `${SUPABASE_PROJECT_PREFIX}${id}` : SUPABASE_PROJECT_KEY;
}

export function readDeveloperToken(connection: DeveloperConnection) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEVELOPER_CONNECTION_KEYS[connection]) || "";
}

export function storeDeveloperToken(
  connection: DeveloperConnection,
  token: string,
) {
  if (typeof window === "undefined") return;
  const value = token.trim();
  if (value) localStorage.setItem(DEVELOPER_CONNECTION_KEYS[connection], value);
  else localStorage.removeItem(DEVELOPER_CONNECTION_KEYS[connection]);
  window.dispatchEvent(
    new CustomEvent("cryzo:developer-connections-changed", {
      detail: { connection },
    }),
  );
}

function parseSupabaseProject(raw: string | null): SupabaseProjectSelection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseProjectSelection>;
    if (!parsed.ref || !parsed.name || !parsed.url || !parsed.publicKey) return null;
    return parsed as SupabaseProjectSelection;
  } catch {
    return null;
  }
}

export function readSupabaseProject(
  conversationId?: string | null,
): SupabaseProjectSelection | null {
  if (typeof window === "undefined") return null;
  const scopedKey = projectStorageKey(conversationId);
  const scoped = parseSupabaseProject(localStorage.getItem(scopedKey));
  if (scoped) return scoped;
  if (scopedKey !== SUPABASE_PROJECT_KEY) {
    return parseSupabaseProject(localStorage.getItem(SUPABASE_PROJECT_KEY));
  }
  return null;
}

export function storeSupabaseProject(
  project: SupabaseProjectSelection | null,
  conversationId?: string | null,
) {
  if (typeof window === "undefined") return;
  const key = projectStorageKey(conversationId);
  if (project) localStorage.setItem(key, JSON.stringify(project));
  else localStorage.removeItem(key);
  window.dispatchEvent(
    new CustomEvent("cryzo:supabase-project-changed", {
      detail: { conversationId: conversationId || activeConversationId() || null },
    }),
  );
}

export function readSupabaseRuntimeContext(conversationId?: string | null) {
  const token = readDeveloperToken("supabase");
  const project = readSupabaseProject(conversationId);
  if (!token || !project) return null;
  return { token, project };
}
