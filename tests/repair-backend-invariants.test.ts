/// <reference types="vite/client" />
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const user = await ctx.db.insert("users", { email: "owner@example.test" });
    const other = await ctx.db.insert("users", { email: "other@example.test" });
    const project = await ctx.db.insert("conversations", { userId: user, title: "Furniture", composioSessionId: null, createdAt: Date.now(), updatedAt: Date.now() });
    await ctx.db.insert("socialAccounts", { userId: user, channel: "facebook", connectedAccountId: "a", name: "Owner" });
    return { user, other, project };
  });
  return { t, ...ids, owner: t.withIdentity({ subject: ids.user + "|session" }), stranger: t.withIdentity({ subject: ids.other + "|session" }) };
}
beforeEach(() => vi.stubEnv("CRYZO_INTERNAL_API_SECRET", "test-service"));
afterEach(() => vi.unstubAllEnvs());
describe("repair backend invariants", () => {
  it("deduplicates MCP additions, permits auth repair and blocks another owner's edits", async () => {
    const { owner, stranger } = await setup();
    const args = { name: "Composio", url: "https://connect.composio.dev/mcp", authType: "none" as const };
    const id = await owner.mutation((api as any).mcpServers.add, args);
    expect(await owner.mutation((api as any).mcpServers.add, { ...args, authType: "api_key" })).toBe(id);
    expect(await owner.query((api as any).mcpServers.list, {})).toHaveLength(1);
    await expect(stranger.mutation((api as any).mcpServers.add, { ...args, serverId: id })).rejects.toThrow("not found");
  });
  it("creates a catalog once and rejects private seeds even when access is omitted", async () => {
    const { t, owner, project } = await setup();
    const args = { conversationId: project, name: "Furniture", entities: [
      { name: "Products", fields: { name: "string" }, access: "public-read" as const, seed: [{ name: "Desk" }] },
      { name: "Orders", fields: { total: "number" }, access: "private" as const, seed: [] },
    ] };
    await owner.mutation(api.cloudAdmin.configureFromPublish, args);
    await owner.mutation(api.cloudAdmin.configureFromPublish, args);
    expect(await t.run(ctx => ctx.db.query("cloudRecords").collect())).toHaveLength(1);
    expect(await t.run(ctx => ctx.db.query("cloudApps").collect())).toHaveLength(1);
    await expect(owner.mutation(api.cloudAdmin.configureFromPublish, { ...args, entities: [
      { name: "PrivateDefault", fields: { name: "string" }, seed: [{ name: "Forbidden" }] },
    ] })).rejects.toThrow("without an owner");
  });
  it("isolates cached analytics by owner, account, range and reporting target", async () => {
    const { owner, stranger } = await setup();
    await owner.mutation(api.social.setAnalyticsTarget, { connectedAccountId: "a", targetId: "123" });
    await expect(owner.mutation(api.social.setAnalyticsTarget, { connectedAccountId: "a", targetId: "invalid" })).rejects.toThrow("valid publishing target");
    for (const targetId of ["123", "456"]) await owner.mutation(api.social.saveAnalyticsSnapshot, {
      connectedAccountId: "a", channel: "facebook", days: 30, targetId, data: { targetId },
    });
    expect((await owner.query(api.social.getAnalyticsSnapshot, { connectedAccountId: "a", days: 30, targetId: "123" }))?.data.targetId).toBe("123");
    expect(await owner.query(api.social.getAnalyticsSnapshot, { connectedAccountId: "a", days: 7, targetId: "123" })).toBeNull();
    expect(await stranger.query(api.social.getAnalyticsSnapshot, { connectedAccountId: "a", days: 30, targetId: "123" })).toBeNull();
    await expect(stranger.mutation(api.social.setAnalyticsTarget, { connectedAccountId: "a", targetId: "123" })).rejects.toThrow("not found");
  });
});
