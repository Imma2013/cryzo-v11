import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]) }));
vi.mock("@/lib/server/provider-secrets", () => ({
  resolveAccountProviderSecret: vi.fn(async () => ({ apiKey: JSON.stringify({ access_token: "test-key", header_name: "x-api-key", header_prefix: "" }) })),
  encryptProviderSecret: vi.fn(), decryptProviderSecret: vi.fn(),
}));
import { listRemoteMcpTools, callRemoteMcpTool, type McpServerRecord } from "@/lib/server/mcp-client";
import { mcpCredentialHeaders } from "@/lib/server/mcp-config";
const server: McpServerRecord = { _id: "server", name: "Fixture", url: "https://mcp.example.test/mcp", transport: "http", authType: "api_key", enabled: true };
afterEach(() => vi.unstubAllGlobals());
describe("MCP SDK transport", () => {
  it("sends named headers, negotiates the protocol, paginates and invokes tools", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("x-api-key")).toBe("test-key");
      if (init?.method !== "POST") return new Response(null, { status: 405 });
      const body = JSON.parse(String(init.body)); calls.push(body);
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      const result = body.method === "initialize"
        ? { protocolVersion: body.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "fixture", version: "1" } }
        : body.method === "tools/list"
          ? { tools: [{ name: body.params?.cursor ? "second" : "first", inputSchema: { type: "object", properties: {} } }], ...(body.params?.cursor ? {} : { nextCursor: "page2" }) }
          : { content: [{ type: "text", text: "invoked" }] };
      return Response.json({ jsonrpc: "2.0", id: body.id, result }, { headers: { "mcp-session-id": "fixture-session" } });
    }));
    expect((await listRemoteMcpTools(server, "session")).map(tool => tool.name)).toEqual(["first", "second"]);
    expect(calls.some(call => call.method === "notifications/initialized")).toBe(true);
    expect(await callRemoteMcpTool(server, { authToken: "session" }, "first", {})).toMatchObject({ content: [{ text: "invoked" }] });
  });
  it("refuses header injection and preserves legacy bearer credentials", () => {
    expect(mcpCredentialHeaders({ access_token: "legacy" })).toEqual({ Authorization: "Bearer legacy" });
    expect(() => mcpCredentialHeaders({ access_token: "secret\r\nOther: value" })).toThrow("line breaks");
    expect(() => mcpCredentialHeaders({ access_token: "secret", header_name: "Host" })).toThrow("authentication header");
  });
});
