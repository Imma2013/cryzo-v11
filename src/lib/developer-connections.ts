export const DEVELOPER_CONNECTION_KEYS = {
  github: "cryzo:github-token",
  vercel: "cryzo:vercel-token",
  netlify: "cryzo:netlify-token",
  supabase: "cryzo:supabase-token",
} as const;

export type DeveloperConnection = keyof typeof DEVELOPER_CONNECTION_KEYS;

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
