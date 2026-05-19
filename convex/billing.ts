import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const FREE_DAILY_CREDITS = 5;
const FREE_MONTHLY_CAP = 30;

const PLAN_CREDITS = {
  free: FREE_MONTHLY_CAP,
  pro: 100,
  pro_plus: 250,
  business: 250,
} as const;

type StoredPlan = keyof typeof PLAN_CREDITS;
type DisplayPlan = "free" | "pro" | "pro_plus";
type SubscriptionDoc = Doc<"subscriptions">;

function normalizePlan(plan: StoredPlan): DisplayPlan {
  return plan === "business" ? "pro_plus" : plan;
}

function paidCredits(plan: StoredPlan) {
  return PLAN_CREDITS[normalizePlan(plan)];
}

function nextDailyReset(now: number) {
  return now + DAY;
}

function nextMonthlyReset(now: number) {
  return now + MONTH;
}

async function findSubscription(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
) {
  return await ctx.db
    .query("subscriptions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

function resetFreeWindows(sub: SubscriptionDoc | null, now: number) {
  const dailyResetAt = sub?.dailyResetAt ?? nextDailyReset(now);
  const freeMonthlyResetAt = sub?.freeMonthlyResetAt ?? nextMonthlyReset(now);

  return {
    dailyCreditsUsed:
      dailyResetAt <= now ? 0 : (sub?.dailyCreditsUsed ?? 0),
    dailyResetAt: dailyResetAt <= now ? nextDailyReset(now) : dailyResetAt,
    freeMonthlyCreditsUsed:
      freeMonthlyResetAt <= now ? 0 : (sub?.freeMonthlyCreditsUsed ?? 0),
    freeMonthlyResetAt:
      freeMonthlyResetAt <= now ? nextMonthlyReset(now) : freeMonthlyResetAt,
  };
}

function validRolloverCredits(sub: SubscriptionDoc, now: number) {
  if (!sub.rolloverCredits) return 0;
  if (sub.rolloverExpiresAt && sub.rolloverExpiresAt <= now) return 0;
  return sub.rolloverCredits;
}

function validTopUpCredits(sub: SubscriptionDoc, now: number) {
  const topUpCredits = sub.topUpCredits ?? 0;
  if (!topUpCredits) return 0;
  if (sub.topUpExpiresAt && sub.topUpExpiresAt <= now) return 0;
  return topUpCredits;
}

function paidAccessActive(sub: SubscriptionDoc, now: number) {
  if (sub.status === "active") return true;
  if (sub.status === "canceled" && sub.currentPeriodEnd > now) return true;
  return false;
}

function computeCredits(sub: SubscriptionDoc | null, now: number) {
  if (!sub || normalizePlan(sub.plan) === "free") {
    const freeWindows = resetFreeWindows(sub, now);
    const dailyRemaining = Math.max(
      0,
      FREE_DAILY_CREDITS - freeWindows.dailyCreditsUsed,
    );
    const freeMonthlyRemaining = Math.max(
      0,
      FREE_MONTHLY_CAP - freeWindows.freeMonthlyCreditsUsed,
    );
    const creditsRemaining = Math.min(dailyRemaining, freeMonthlyRemaining);

    return {
      plan: "free" as DisplayPlan,
      status: "active" as const,
      monthlyCredits: FREE_MONTHLY_CAP,
      creditsUsed: freeWindows.freeMonthlyCreditsUsed,
      rolloverCredits: 0,
      topUpCredits: 0,
      creditsRemaining,
      dailyCreditsUsed: freeWindows.dailyCreditsUsed,
      dailyCreditsRemaining: dailyRemaining,
      dailyResetAt: freeWindows.dailyResetAt,
      freeMonthlyCreditsUsed: freeWindows.freeMonthlyCreditsUsed,
      freeMonthlyRemaining,
      freeMonthlyResetAt: freeWindows.freeMonthlyResetAt,
      currentPeriodEnd: freeWindows.freeMonthlyResetAt,
      billingCreditsTotal: FREE_MONTHLY_CAP,
      stripeCustomerId: undefined as string | undefined,
      stripeSubscriptionId: undefined as string | undefined,
      rolloverExpiresAt: undefined as number | undefined,
      topUpExpiresAt: undefined as number | undefined,
    };
  }

  const plan = normalizePlan(sub.plan);
  const monthlyCredits = paidCredits(sub.plan);
  const rolloverCredits = validRolloverCredits(sub, now);
  const topUpCredits = validTopUpCredits(sub, now);
  const periodCreditsRemaining = paidAccessActive(sub, now)
    ? Math.max(0, monthlyCredits + rolloverCredits - sub.creditsUsed)
    : 0;
  const creditsRemaining = periodCreditsRemaining + topUpCredits;

  return {
    plan,
    status: sub.status,
    monthlyCredits,
    creditsUsed: sub.creditsUsed,
    rolloverCredits,
    topUpCredits,
    creditsRemaining,
    dailyCreditsUsed: 0,
    dailyCreditsRemaining: 0,
    dailyResetAt: sub.dailyResetAt ?? nextDailyReset(now),
    freeMonthlyCreditsUsed: 0,
    freeMonthlyRemaining: 0,
    freeMonthlyResetAt: sub.freeMonthlyResetAt ?? nextMonthlyReset(now),
    currentPeriodEnd: sub.currentPeriodEnd,
    billingCreditsTotal: monthlyCredits + rolloverCredits + topUpCredits,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    rolloverExpiresAt: sub.rolloverExpiresAt,
    topUpExpiresAt: sub.topUpExpiresAt,
  };
}

async function createFreeSubscription(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
) {
  const id = await ctx.db.insert("subscriptions", {
    userId,
    plan: "free",
    status: "active",
    currentPeriodEnd: nextMonthlyReset(now),
    monthlyCredits: FREE_MONTHLY_CAP,
    creditsUsed: 0,
    rolloverCredits: 0,
    topUpCredits: 0,
    dailyCreditsUsed: 0,
    dailyResetAt: nextDailyReset(now),
    freeMonthlyCreditsUsed: 0,
    freeMonthlyResetAt: nextMonthlyReset(now),
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

export const getSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    return computeCredits(sub, Date.now());
  },
});

export const hasCredits = query({
  args: {
    userId: v.id("users"),
    amount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    const amount = args.amount ?? 1;
    return computeCredits(sub, Date.now()).creditsRemaining >= amount;
  },
});

export const getCreditHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("creditLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);
  },
});

export const deductCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
    description: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amount = Math.max(0, args.amount);
    let sub = await findSubscription(ctx, args.userId);

    if (!sub) {
      sub = await createFreeSubscription(ctx, args.userId, now);
    }
    if (!sub) {
      throw new Error("Unable to create subscription");
    }

    const current = computeCredits(sub, now);
    if (current.creditsRemaining < amount) {
      return { success: false, remaining: current.creditsRemaining };
    }

    if (current.plan === "free") {
      const freeWindows = resetFreeWindows(sub, now);
      const nextDailyUsed = freeWindows.dailyCreditsUsed + amount;
      const nextMonthlyUsed = freeWindows.freeMonthlyCreditsUsed + amount;
      const remaining = Math.min(
        Math.max(0, FREE_DAILY_CREDITS - nextDailyUsed),
        Math.max(0, FREE_MONTHLY_CAP - nextMonthlyUsed),
      );

      await ctx.db.patch(sub._id, {
        dailyCreditsUsed: nextDailyUsed,
        dailyResetAt: freeWindows.dailyResetAt,
        freeMonthlyCreditsUsed: nextMonthlyUsed,
        freeMonthlyResetAt: freeWindows.freeMonthlyResetAt,
        creditsUsed: nextMonthlyUsed,
        updatedAt: now,
      });
      await ctx.db.insert("creditLedger", {
        userId: args.userId,
        amount: -amount,
        balance: remaining,
        reason: args.reason ?? "message",
        description: args.description,
        messageId: args.messageId,
        createdAt: now,
      });

      return { success: true, remaining };
    }

    const rolloverCredits = validRolloverCredits(sub, now);
    const baseAndRollover = current.monthlyCredits + rolloverCredits;
    const availableBase = Math.max(0, baseAndRollover - sub.creditsUsed);
    const baseDeduction = Math.min(amount, availableBase);
    const topUpDeduction = amount - baseDeduction;
    const nextCreditsUsed = sub.creditsUsed + baseDeduction;
    const nextTopUpCredits = Math.max(0, current.topUpCredits - topUpDeduction);
    const remaining = Math.max(
      0,
      baseAndRollover - nextCreditsUsed + nextTopUpCredits,
    );

    await ctx.db.patch(sub._id, {
      creditsUsed: nextCreditsUsed,
      topUpCredits: nextTopUpCredits,
      rolloverCredits,
      rolloverExpiresAt: rolloverCredits ? sub.rolloverExpiresAt : undefined,
      updatedAt: now,
    });
    await ctx.db.insert("creditLedger", {
      userId: args.userId,
      amount: -amount,
      balance: remaining,
      reason: args.reason ?? "message",
      description: args.description,
      messageId: args.messageId,
      createdAt: now,
    });

    return { success: true, remaining };
  },
});

export const createSubscription = mutation({
  args: {
    userId: v.id("users"),
    plan: v.union(
      v.literal("pro"),
      v.literal("pro_plus"),
      v.literal("business"),
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findSubscription(ctx, args.userId);
    const plan = normalizePlan(args.plan);
    const monthlyCredits = PLAN_CREDITS[plan];

    if (
      existing?.stripeSubscriptionId &&
      existing.stripeSubscriptionId === args.stripeSubscriptionId &&
      normalizePlan(existing.plan) === plan
    ) {
      await ctx.db.patch(existing._id, {
        stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
        currentPeriodEnd: args.currentPeriodEnd,
        monthlyCredits,
        status: "active",
        updatedAt: now,
      });
      return { success: true, duplicate: true };
    }

    const existingCredits = existing ? computeCredits(existing, now) : null;
    const rolloverCredits =
      existing && existingCredits && existingCredits.plan !== "free"
        ? Math.max(
            0,
            existingCredits.monthlyCredits -
              Math.min(existing.creditsUsed, existingCredits.monthlyCredits),
          )
        : 0;
    const topUpCredits = existing ? validTopUpCredits(existing, now) : 0;

    if (existing) {
      await ctx.db.patch(existing._id, {
        plan,
        stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
        stripeSubscriptionId:
          args.stripeSubscriptionId ?? existing.stripeSubscriptionId,
        status: "active",
        currentPeriodEnd: args.currentPeriodEnd,
        monthlyCredits,
        creditsUsed: 0,
        rolloverCredits,
        rolloverExpiresAt: rolloverCredits ? now + MONTH : undefined,
        topUpCredits,
        topUpExpiresAt: topUpCredits ? existing.topUpExpiresAt : undefined,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("subscriptions", {
        userId: args.userId,
        plan,
        stripeCustomerId: args.stripeCustomerId,
        stripeSubscriptionId: args.stripeSubscriptionId,
        status: "active",
        currentPeriodEnd: args.currentPeriodEnd,
        monthlyCredits,
        creditsUsed: 0,
        rolloverCredits: 0,
        topUpCredits: 0,
        dailyCreditsUsed: 0,
        dailyResetAt: nextDailyReset(now),
        freeMonthlyCreditsUsed: 0,
        freeMonthlyResetAt: nextMonthlyReset(now),
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert("creditLedger", {
      userId: args.userId,
      amount: monthlyCredits,
      balance: monthlyCredits + rolloverCredits + topUpCredits,
      reason: "subscription",
      description: `${plan === "pro_plus" ? "Pro+" : "Pro"} monthly credits`,
      createdAt: now,
    });

    return { success: true, duplicate: false };
  },
});

export const updateSubscriptionByStripe = mutation({
  args: {
    stripeSubscriptionId: v.string(),
    plan: v.optional(
      v.union(v.literal("pro"), v.literal("pro_plus"), v.literal("business")),
    ),
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("canceled"),
        v.literal("past_due"),
      ),
    ),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();

    if (!sub) return { success: false };

    const plan = args.plan ? normalizePlan(args.plan) : normalizePlan(sub.plan);
    await ctx.db.patch(sub._id, {
      plan,
      monthlyCredits: PLAN_CREDITS[plan],
      status: args.status ?? sub.status,
      currentPeriodEnd: args.currentPeriodEnd ?? sub.currentPeriodEnd,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

export const resetMonthlyCredits = mutation({
  args: {
    stripeSubscriptionId: v.string(),
    currentPeriodEnd: v.optional(v.number()),
    stripeEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.stripeEventId) {
      const existingLedger = await ctx.db
        .query("creditLedger")
        .withIndex("by_stripe_event", (q) =>
          q.eq("stripeEventId", args.stripeEventId),
        )
        .unique();
      if (existingLedger) {
        return { success: true, duplicate: true };
      }
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();

    if (!sub || normalizePlan(sub.plan) === "free") {
      return { success: false };
    }

    const plan = normalizePlan(sub.plan);
    const monthlyCredits = PLAN_CREDITS[plan];
    const unusedMonthlyCredits = Math.max(
      0,
      monthlyCredits - Math.min(sub.creditsUsed, monthlyCredits),
    );
    const topUpCredits = validTopUpCredits(sub, now);
    const balance = monthlyCredits + unusedMonthlyCredits + topUpCredits;

    await ctx.db.patch(sub._id, {
      monthlyCredits,
      creditsUsed: 0,
      rolloverCredits: unusedMonthlyCredits,
      rolloverExpiresAt: unusedMonthlyCredits ? now + MONTH : undefined,
      topUpCredits,
      topUpExpiresAt: topUpCredits ? sub.topUpExpiresAt : undefined,
      currentPeriodEnd: args.currentPeriodEnd ?? sub.currentPeriodEnd,
      updatedAt: now,
    });

    await ctx.db.insert("creditLedger", {
      userId: sub.userId,
      amount: monthlyCredits,
      balance,
      reason: "subscription_cycle",
      description: `${plan === "pro_plus" ? "Pro+" : "Pro"} monthly renewal`,
      stripeEventId: args.stripeEventId,
      createdAt: now,
    });

    return { success: true };
  },
});

export const grantCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.string(),
    description: v.optional(v.string()),
    stripeEventId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    if (args.stripeEventId) {
      const existingLedger = await ctx.db
        .query("creditLedger")
        .withIndex("by_stripe_event", (q) =>
          q.eq("stripeEventId", args.stripeEventId),
        )
        .unique();
      if (existingLedger) {
        return { success: true, duplicate: true };
      }
    }

    let sub = await findSubscription(ctx, args.userId);
    if (!sub) {
      sub = await createFreeSubscription(ctx, args.userId, now);
    }
    if (!sub) {
      throw new Error("Unable to create subscription");
    }

    const existingTopUpCredits = validTopUpCredits(sub, now);
    const nextTopUpCredits = existingTopUpCredits + args.amount;
    const current = computeCredits(sub, now);
    const balance = current.creditsRemaining + args.amount;

    await ctx.db.patch(sub._id, {
      topUpCredits: nextTopUpCredits,
      topUpExpiresAt: now + YEAR,
      updatedAt: now,
    });

    await ctx.db.insert("creditLedger", {
      userId: args.userId,
      amount: args.amount,
      balance,
      reason: args.reason,
      description: args.description,
      stripeEventId: args.stripeEventId,
      createdAt: now,
    });

    return { success: true, duplicate: false };
  },
});

export const recordStripeEvent = mutation({
  args: {
    eventId: v.string(),
    eventType: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing) {
      return { alreadyProcessed: true };
    }

    await ctx.db.insert("processedStripeEvents", {
      eventId: args.eventId,
      eventType: args.eventType,
      createdAt: Date.now(),
    });

    return { alreadyProcessed: false };
  },
});

export const isStripeEventProcessed = query({
  args: { eventId: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();

    return existing !== null;
  },
});
