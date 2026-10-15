import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/server/mcp-client", () => ({ assertPublicMcpUrl: vi.fn(async (url: string) => new URL(url)) }));
vi.mock("@/lib/server/request-user", () => ({ requireRequestUserId: vi.fn(async () => "owner") }));
vi.mock("convex/nextjs", () => ({ fetchQuery: vi.fn(async () => ({ url: "https://mcp.example.test/mcp" })), fetchMutation: vi.fn(async () => null) }));
vi.mock("@/lib/server/provider-secrets", async original => ({
  ...await original<typeof import("@/lib/server/provider-secrets")>(),
  resolveAccountProviderSecret: vi.fn(async () => null),
}));
import { beginMcpOAuth, encodeMcpOauthState, decodeMcpOauthState } from "@/lib/server/mcp-oauth";
import { POST } from "@/app/api/mcp/oauth/start/route";
import { GET } from "@/app/api/mcp/oauth/callback/route";
import { fetchMutation } from "convex/nextjs";

let metadata: Record<string, unknown>;
beforeEach(() => {
  vi.stubEnv("CRYZO_SECRETS_KEY", "test-encryption-key");
  metadata = { issuer: "https://auth.example.test", authorization_endpoint: "https://auth.example.test/authorize", token_endpoint: "https://auth.example.test/token", registration_endpoint: "https://auth.example.test/register", code_challenge_methods_supported: ["S256"], authorization_response_iss_parameter_supported: true };
  vi.stubGlobal("fetch", vi.fn(async (input: any) => {
    const url = String(input);
    if (url === "https://mcp.example.test/mcp") return new Response(null, { status: 401 });
    if (url.includes("oauth-protected-resource")) return Response.json({ resource: "https://mcp.example.test/mcp", authorization_servers: ["https://auth.example.test"] });
    if (url.includes(".well-known/")) return Response.json(metadata);
    if (url.endsWith("/register")) return Response.json({ client_id: "registered" });
    if (url.endsWith("/token")) return Response.json({ access_token: "provider-token", refresh_token: "refresh-token" });
    throw new Error("Unexpected request");
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("MCP OAuth", () => {
  it("uses registered client credentials and PKCE without dynamic registration", async () => {
    const result = await beginMcpOAuth("https://mcp.example.test/mcp", "https://cryzo.example.test/api/mcp/oauth/callback", { client_id: "existing", client_secret: "secret", token_endpoint_auth_method: "client_secret_basic" });
    expect(result.clientId).toBe("existing");
    expect(result.challenge).not.toBe(result.verifier);
    expect(result.issuerRequired).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith("/register"))).toBe(false);
  });
  it("supports client metadata documents and rejects servers without S256", async () => {
    metadata.client_id_metadata_document_supported = true;
    expect((await beginMcpOAuth("https://mcp.example.test/mcp", "https://cryzo.example.test/api/mcp/oauth/callback")).clientId).toBe("https://cryzo.example.test/api/mcp/oauth/client-metadata");
    metadata.code_challenge_methods_supported = ["plain"];
    await expect(beginMcpOAuth("https://mcp.example.test/mcp", "https://cryzo.example.test/api/mcp/oauth/callback")).rejects.toThrow("S256");
  });
  it("binds the callback to its browser cookie, keeps the session out of URLs and encrypts tokens", async () => {
    const start = await POST(new Request("https://cryzo.example.test/api/mcp/oauth/start", { method: "POST", headers: { authorization: "Bearer private-session", "content-type": "application/json" }, body: JSON.stringify({ serverId: "server" }) }));
    expect(start.status).toBe(200);
    const authorization = new URL((await start.json()).authorizationUrl);
    expect(authorization.toString()).not.toContain("private-session");
    const cookie = start.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).not.toContain("private-session");
    const callback = "https://cryzo.example.test/api/mcp/oauth/callback?code=code&state=" + authorization.searchParams.get("state") + "&iss=https%3A%2F%2Fauth.example.test";
    const response = await GET(new Request(callback, { headers: { cookie } }));
    expect(response.headers.get("location")).toContain("oauth=connected");
    expect(fetchMutation).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(fetchMutation).mock.calls[0][1])).not.toContain("provider-token");
    const rejected = await GET(new Request(callback.replace(/state=[^&]+/, "state=wrong"), { headers: { cookie } }));
    expect(rejected.headers.get("location")).toContain("oauth=error");
    expect(fetchMutation).toHaveBeenCalledOnce();
  });
  it("rejects expired and altered encrypted state", () => {
    const state = encodeMcpOauthState({ serverId: "server", userId: "owner", authToken: "session", verifier: "pkce", redirectUri: "https://cryzo.example.test/cb", tokenEndpoint: "https://auth.example.test/token", clientId: "client", createdAt: Date.now() - 601_000 });
    expect(() => decodeMcpOauthState(state)).toThrow("expired");
    expect(() => decodeMcpOauthState(state.slice(3))).toThrow();
  });
});
