import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query, internalMutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const AI_ALLOWANCE_MICROS: Record<string, number> = {
  free: 0, starter: 10_000_000, builder: 25_000_000,
  pro: 50_000_000, elite: 100_000_000, pro_plus: 25_000_000, business: 25_000_000,
};

async function entitlement(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  const owners = ["lloyd.ebnchenge@gmail.com", ...(process.env.INTERNAL_TESTER_EMAILS ?? "").split(",")];
  const owner = owners.some(email => email.trim().toLowerCase() === user?.email?.toLowerCase());
  const sub = await ctx.db.query("subscriptions").withIndex("by_user", q => q.eq("userId", userId)).unique();
  const active = sub && (sub.status === "active" || (sub.status === "canceled" && sub.currentPeriodEnd > Date.now()));
  const plan = owner ? "elite" : active ? (sub.plan === "pro" && (sub.messageMonthlyCredits ?? sub.monthlyCredits ?? 0) > 0 && (sub.messageMonthlyCredits ?? sub.monthlyCredits ?? 0) <= 100 ? "starter" : sub.plan) : "free";
  return { plan, owner, allowance: owner ? 1_000_000_000_000 : AI_ALLOWANCE_MICROS[plan] ?? 0 };
}

const periodNow = () => new Date().toISOString().slice(0, 7);
const dayNow = () => new Date().toISOString().slice(0, 10);

export const balance = query({
  args: {},
  returns: v.object({ plan: v.string(), allowanceMicros: v.number(), spentMicros: v.number(), remainingMicros: v.number(), freeRemaining: v.number(), dailyRemaining: v.number(), period: v.string() }),
  handler: async ctx => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to view usage.");
    const access = await entitlement(ctx, userId);
    const period = periodNow();
    const meter = await ctx.db.query("aiUsageMeters").withIndex("by_user_period", q => q.eq("userId", userId).eq("period", period)).unique();
    return { plan: access.plan, allowanceMicros: access.allowance, spentMicros: meter?.spentMicros ?? 0,
      remainingMicros: Math.max(0, access.allowance - (meter?.spentMicros ?? 0) - (meter?.reservedMicros ?? 0)),
      freeRemaining: Math.max(0, 25 - (meter?.freeRuns ?? 0) - (meter?.reservedRuns ?? 0)),
      dailyRemaining: Math.max(0, 5 - (meter?.day === dayNow() ? meter.dailyRuns : 0) - (meter?.reservedRuns ?? 0)), period };
  },
});

export const reserve = mutation({
  args: { conversationId: v.id("conversations"), requestKey: v.string(), modelId: v.string(), freeModel: v.boolean(), maxCostMicros: v.number(), serviceKey: v.string() },
  returns: v.id("aiRuns"),
  handler: async (ctx, args) => {
    if (!process.env.CRYZO_INTERNAL_API_SECRET || args.serviceKey !== process.env.CRYZO_INTERNAL_API_SECRET) throw new Error("Unauthorized reservation.");
    const userId = await getAuthUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!userId || conversation?.userId !== userId) throw new Error("Project not found.");
    if (!Number.isSafeInteger(args.maxCostMicros) || args.maxCostMicros < 0 || args.requestKey.length > 200) throw new Error("Invalid reservation.");
    const access = await entitlement(ctx, userId);
    if (!args.freeModel && access.plan === "free") throw new Error("starter_required");
    const duplicate = await ctx.db.query("aiRuns").withIndex("by_user_request", q => q.eq("userId", userId).eq("requestKey", args.requestKey)).order("desc").first();
    if (duplicate?.status === "completed") throw new Error("request_already_completed");
    const active = await ctx.db.query("aiRuns").withIndex("by_user_status", q => q.eq("userId", userId).eq("status", "running")).take(10);
    for (const run of active) {
      if (run.expiresAt > Date.now()) throw new Error("A generation is already running. Stop it or wait before retrying.");
      await settleRun(ctx, run._id, false, 0);
    }
    const period = periodNow(), day = dayNow();
    let meter = await ctx.db.query("aiUsageMeters").withIndex("by_user_period", q => q.eq("userId", userId).eq("period", period)).unique();
    if (!meter) {
      const id = await ctx.db.insert("aiUsageMeters", { userId, period, spentMicros: 0, reservedMicros: 0, freeRuns: 0, reservedRuns: 0, day, dailyRuns: 0 });
      meter = (await ctx.db.get(id))!;
    }
    const free = access.plan === "free" && !access.owner;
    const daily = meter.day === day ? meter.dailyRuns : 0;
    if (free && (meter.freeRuns >= 25 || daily >= 5)) throw new Error("no_message_credits");
    if (!access.owner && args.maxCostMicros > access.allowance - meter.spentMicros - meter.reservedMicros) throw new Error("no_message_credits");
    const id = await ctx.db.insert("aiRuns", { userId, conversationId: args.conversationId, requestKey: args.requestKey, period, day,
      requestedModel: args.modelId, status: "running", reservedMicros: args.maxCostMicros, free, expiresAt: Date.now() + 300_000, createdAt: Date.now() });
    await ctx.db.patch(meter._id, { reservedMicros: meter.reservedMicros + args.maxCostMicros, reservedRuns: meter.reservedRuns + (free ? 1 : 0), day, dailyRuns: daily });
    await ctx.scheduler.runAfter(305_000, internal.aiUsage.expire, { runId: id });
    return id;
  },
});

async function settleRun(ctx: MutationCtx, runId: Id<"aiRuns">, success: boolean, costMicros: number, detail?: { actualModel?: string; generationId?: string; telemetry?: unknown }) {
  const run = await ctx.db.get(runId);
  if (!run || run.status !== "running") return null;
  const meter = await ctx.db.query("aiUsageMeters").withIndex("by_user_period", q => q.eq("userId", run.userId).eq("period", run.period)).unique();
  // Provider costs can exceed an estimate; Cryzo absorbs any amount beyond the reserved ceiling.
  const cost = success ? Math.min(costMicros, run.reservedMicros) : 0;
  await ctx.db.patch(run._id, { status: success ? "completed" : "failed", costMicros: cost, ...detail });
  if (meter) await ctx.db.patch(meter._id, {
    spentMicros: meter.spentMicros + cost, reservedMicros: Math.max(0, meter.reservedMicros - run.reservedMicros),
    reservedRuns: Math.max(0, meter.reservedRuns - (run.free ? 1 : 0)),
    freeRuns: meter.freeRuns + (success && run.free ? 1 : 0),
    dailyRuns: meter.dailyRuns + (success && run.free && meter.day === run.day ? 1 : 0),
  });
  return null;
}

export const settle = mutation({
  args: { serviceKey: v.string(), runId: v.id("aiRuns"), success: v.boolean(), costMicros: v.number(), actualModel: v.optional(v.string()), generationId: v.optional(v.string()), telemetry: v.optional(v.any()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = process.env.CRYZO_INTERNAL_API_SECRET;
    if (!key || args.serviceKey !== key) throw new Error("Unauthorized settlement.");
    if (!Number.isSafeInteger(args.costMicros) || args.costMicros < 0) throw new Error("Invalid cost.");
    return settleRun(ctx, args.runId, args.success, args.costMicros, { actualModel: args.actualModel, generationId: args.generationId, telemetry: args.telemetry });
  },
});

export const expire = internalMutation({
  args: { runId: v.id("aiRuns") }, returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    return run && run.expiresAt <= Date.now() ? settleRun(ctx, run._id, false, 0) : null;
  },
});
