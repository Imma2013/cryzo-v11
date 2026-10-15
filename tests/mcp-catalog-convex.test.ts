/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { encodeMcpTool, decodeMcpTool } from "@/lib/server/mcp-schema";
const modules = import.meta.glob("../convex/**/*.ts");

describe("MCP schemas across the real Convex boundary", () => {
  it("preserves reserved JSON Schema keys, nested refs, and an active catalog during failed discovery", async () => {
    const t = convexTest(schema, modules);
    const user = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Owner" }),
    );
    const owner = t.withIdentity({ subject: user });
    const serverId = await owner.mutation(api.mcpServers.add, {
      name: "Firecrawl",
      url: "https://mcp.firecrawl.dev/v2/mcp-oauth",
      authType: "oauth",
    });
    const inputSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $defs: { query: { type: "string" } },
      type: "object",
      properties: { $value: { $ref: "#/$defs/query" } },
    };
    const stored = encodeMcpTool({ name: "crawl", inputSchema });
    await owner.mutation(api.mcpCatalog.stage, {
      serverId,
      version: "one",
      tools: [stored],
    });
    await owner.mutation(api.mcpCatalog.stage, {
      serverId,
      version: "one",
      tools: [stored],
    }); // retry is idempotent
    await owner.mutation(api.mcpCatalog.activate, {
      serverId,
      version: "one",
      count: 1,
    });
    const page = await owner.query(api.mcpCatalog.page, {
      serverId,
      cursor: null,
    });
    expect(decodeMcpTool(page.tools[0]).inputSchema).toEqual(inputSchema);
    await owner.mutation(api.mcpCatalog.stage, {
      serverId,
      version: "partial",
      tools: [stored],
    });
    await expect(
      owner.mutation(api.mcpCatalog.activate, {
        serverId,
        version: "partial",
        count: 2,
      }),
    ).rejects.toThrow("incomplete");
    expect(
      (await owner.query(api.mcpServers.get, { serverId }))?.catalogVersion,
    ).toBe("one");
    const stranger = t.withIdentity({
      subject: await t.run((ctx) => ctx.db.insert("users", { name: "Other" })),
    });
    await expect(
      stranger.query(api.mcpCatalog.page, { serverId, cursor: null }),
    ).rejects.toThrow("not found");
  });
});
