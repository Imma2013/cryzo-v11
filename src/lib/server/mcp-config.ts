export type McpCredential = {
  access_token?: string; refresh_token?: string; token_type?: string; expires_at?: number;
  token_endpoint?: string; client_id?: string; client_secret?: string;
  token_endpoint_auth_method?: string; resource?: string;
  header_name?: string; header_prefix?: string;
};

export function mcpCredentialHeaders(credential: McpCredential | null): Record<string, string> {
  const token = credential?.access_token?.trim();
  if (!token) return {};
  const name = credential?.header_name || "Authorization";
  if (!/^[A-Za-z][A-Za-z0-9-]{0,79}$/.test(name) ||
      /^(host|cookie|content-length|connection|proxy-authorization|content-type|accept|mcp-.+)$/i.test(name)) {
    throw new Error("Choose a valid authentication header such as Authorization or x-api-key.");
  }
  const prefix = credential?.header_prefix ?? (name.toLowerCase() === "authorization" ? credential?.token_type || "Bearer" : "");
  if (/[\r\n]/.test(prefix + token)) throw new Error("Authentication credentials cannot contain line breaks.");
  return { [name]: prefix ? prefix + " " + token : token };
}
