export const DEVELOPER_CONNECTION_KEYS = {
  github: "cryzo:github-token",
  vercel: "cryzo:vercel-token",
  netlify: "cryzo:netlify-token",
  supabase: "cryzo:supabase-token",
  expo: "cryzo:expo-token",
} as const;

const SUPABASE_PROJECT_KEY = "cryzo:supabase-project";

export type DeveloperConnection = keyof typeof DEVELOPER_CONNECTION_KEYS;

export type SupabaseProjectSelection = {
  ref: string;
  name: string;
  url: string;
  publicKey: string;
};

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

export function readSupabaseProject(): SupabaseProjectSelection | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SUPABASE_PROJECT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SupabaseProjectSelection>;
    if (!parsed.ref || !parsed.name || !parsed.url || !parsed.publicKey) return null;
    return parsed as SupabaseProjectSelection;
  } catch {
    return null;
  }
}

export function storeSupabaseProject(project: SupabaseProjectSelection | null) {
  if (typeof window === "undefined") return;
  if (project) localStorage.setItem(SUPABASE_PROJECT_KEY, JSON.stringify(project));
  else localStorage.removeItem(SUPABASE_PROJECT_KEY);
  window.dispatchEvent(new Event("cryzo:supabase-project-changed"));
}

export function readSupabaseRuntimeContext() {
  const token = readDeveloperToken("supabase");
  const project = readSupabaseProject();
  if (!token || !project) return null;
  return { token, project };
}
