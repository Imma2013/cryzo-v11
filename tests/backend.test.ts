/// <reference types="vite/client" />
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const serviceKey = "test-only-internal-service-key";
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const userId = await ctx.db.insert("users", { email: "test@example.com" });
    const strangerId = await ctx.db.insert("users", { email: "stranger@example.com" });
    const project = (user: typeof userId) => ctx.db.insert("conversations", {
      userId: user, title: "Test", composioSessionId: null, createdAt: Date.now(), updatedAt: Date.now(),
    });
    return { userId, strangerId, conversationId: await project(userId), otherProject: await project(strangerId) };
  });
  const authed = t.withIdentity({ subject: ids.userId + "|session" });
  return { t, authed, ...ids };
}
beforeEach(() => { vi.stubEnv("CRYZO_INTERNAL_API_SECRET", serviceKey); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("managed AI ledger", () => {
  it("reserves multi-step costs atomically and settles exact reported usage once", async () => {
    const { t, authed, conversationId, userId } = await setup();
    await t.run(ctx => ctx.db.insert("subscriptions", { userId, plan: "starter", status: "active", currentPeriodEnd: Date.now() + 86400000, monthlyCredits: 100, creditsUsed: 0, rolloverCredits: 0, createdAt: Date.now(), updatedAt: Date.now() }));
    const runId = await authed.mutation(api.aiUsage.reserve, { conversationId, requestKey: "paid", modelId: "paid", freeModel: false, maxCostMicros: 500000, serviceKey });
    await t.mutation(api.aiUsage.extendReservation, { serviceKey, runId, maxCostMicros: 2000000 });
    expect((await authed.query(api.aiUsage.balance, {})).remainingMicros).toBe(8000000);
    await expect(t.mutation(api.aiUsage.extendReservation, { serviceKey, runId, maxCostMicros: 10000001 })).rejects.toThrow("no_message_credits");
    await t.mutation(api.aiUsage.settle, { serviceKey, runId, success: true, costMicros: 1234567 });
    await t.mutation(api.aiUsage.settle, { serviceKey, runId, success: true, costMicros: 1234567 });
    expect((await authed.query(api.aiUsage.balance, {})).remainingMicros).toBe(8765433);
  });
  it("honors legacy purchased top-ups without replenishing spent top-ups next month", async () => {
    const { t, authed, conversationId, userId } = await setup();
    await t.run(ctx => ctx.db.insert("subscriptions", { userId, plan: "starter", status: "active", currentPeriodEnd: Date.now() + 90 * 86400000, monthlyCredits: 100, creditsUsed: 0, rolloverCredits: 0, messageTopUpCredits: 100, messageTopUpExpiresAt: Date.now() + 365 * 86400000, createdAt: Date.now(), updatedAt: Date.now() }));
    expect((await authed.query(api.aiUsage.balance, {})).remainingMicros).toBe(30000000);
    const runId = await authed.mutation(api.aiUsage.reserve, { conversationId, requestKey: "top-up", modelId: "paid", freeModel: false, maxCostMicros: 12000000, serviceKey });
    await t.mutation(api.aiUsage.settle, { serviceKey, runId, success: true, costMicros: 12000000 });
    expect((await authed.query(api.aiUsage.balance, {})).remainingMicros).toBe(18000000);
    vi.setSystemTime(Date.now() + 32 * 86400000);
    expect((await authed.query(api.aiUsage.balance, {})).remainingMicros).toBe(28000000);
  });
  it("releases failed runs and rejects duplicate success settlement", async () => {
    const { t, authed, conversationId } = await setup();
    const input = { conversationId, requestKey: "r1", modelId: "free-model", freeModel: true, maxCostMicros: 0, serviceKey };
    const failed = await authed.mutation(api.aiUsage.reserve, input);
    await t.mutation(api.aiUsage.settle, { serviceKey, runId: failed, success: false, costMicros: 0 });
    expect((await authed.query(api.aiUsage.balance, {})).freeRemaining).toBe(25);
    const retry = await authed.mutation(api.aiUsage.reserve, input);
    await t.mutation(api.aiUsage.settle, { serviceKey, runId: retry, success: true, costMicros: 0 });
    await t.mutation(api.aiUsage.settle, { serviceKey, runId: retry, success: true, costMicros: 0 });
    expect((await authed.query(api.aiUsage.balance, {})).freeRemaining).toBe(24);
    await expect(authed.mutation(api.aiUsage.reserve, input)).rejects.toThrow("request_already_completed");
  });
  it("enforces five successful daily runs, not five attempts", async () => {
    const { t, authed, conversationId } = await setup();
    for (let i = 0; i < 5; i++) {
      const runId = await authed.mutation(api.aiUsage.reserve, { conversationId, requestKey: "r" + i, modelId: "free-model", freeModel: true, maxCostMicros: 0, serviceKey });
      await t.mutation(api.aiUsage.settle, { serviceKey, runId, success: true, costMicros: 0 });
    }
    await expect(authed.mutation(api.aiUsage.reserve, { conversationId, requestKey: "six", modelId: "free-model", freeModel: true, maxCostMicros: 0, serviceKey })).rejects.toThrow("no_message_credits");
  });
  it("blocks cross-project access and untrusted reservations", async () => {
    const { authed, otherProject, conversationId } = await setup();
    const args = { conversationId, requestKey: "r", modelId: "free", freeModel: true, maxCostMicros: 0, serviceKey };
    await expect(authed.mutation(api.aiUsage.reserve, { ...args, conversationId: otherProject })).rejects.toThrow("Project not found");
    await expect(authed.mutation(api.aiUsage.reserve, { ...args, serviceKey: "wrong" })).rejects.toThrow("Unauthorized");
  });
});

describe("project marketing", () => {
  it("persists project scope and deduplicates draft retries", async () => {
    const { authed, conversationId, otherProject } = await setup();
    const args = { conversationId, requestKey: "post1", content: "Hello", channels: ["x" as const], scheduledFor: Date.now(), status: "draft" as const };
    const id = await authed.mutation(api.social.createPost, args);
    expect(await authed.mutation(api.social.createPost, args)).toBe(id);
    const posts = await authed.query(api.social.listPosts, { conversationId });
    expect(posts).toHaveLength(1);
    expect(posts[0].conversationId).toBe(conversationId);
    await expect(authed.query(api.social.listPosts, { conversationId: otherProject })).rejects.toThrow("Project not found");
  });
  it("blocks scheduling on Free and publishing without a real connection", async () => {
    const { authed, conversationId } = await setup();
    const args = { conversationId, requestKey: "p", content: "Hello", channels: ["x" as const], scheduledFor: Date.now() + 60000 };
    await expect(authed.mutation(api.social.createPost, { ...args, status: "scheduled" })).rejects.toThrow("Starter");
    const postId = await authed.mutation(api.social.createPost, { ...args, status: "draft" });
    await expect(authed.mutation(api.social.publishNow, { postId })).rejects.toThrow("Connect");
  });
  it("claims delivery only once and releases a definitely failed post quota", async () => {
    const { t, authed, conversationId } = await setup();
    await authed.mutation(api.social.bindAccount, { conversationId, channel: "x", connectedAccountId: "verified-test-account", name: "Test", serviceKey });
    const postId = await authed.mutation(api.social.createPost, { conversationId, requestKey: "p", content: "Hello", channels: ["x"], scheduledFor: Date.now(), status: "draft" });
    await authed.mutation(api.social.publishNow, { postId });
    const deliveries = await t.mutation(internal.social.claimPost, { postId });
    expect(deliveries).toHaveLength(1);
    expect(await t.mutation(internal.social.claimDelivery, { deliveryId: deliveries[0] })).toBe(true);
    expect(await t.mutation(internal.social.claimDelivery, { deliveryId: deliveries[0] })).toBe(false);
    await t.mutation(internal.social.markDeliveryFailed, { deliveryId: deliveries[0], error: "Rejected", outcomeUnknown: false });
    expect((await authed.query(api.social.getAccess, { now: Date.now(), conversationId })).postsUsed).toBe(0);
  });
});
