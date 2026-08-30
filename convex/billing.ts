import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";

const DAY = 24 * 60 * 60 * 1000;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const FREE_DAILY_MESSAGE_CREDITS = 5;

export const PLAN_LIMITS = {
  free: { message: 25, integration: 100 },
  starter: { message: 100, integration: 2_000 },
  builder: { message: 250, integration: 10_000 },
  pro: { message: 500, integration: 20_000 },
  elite: { message: 1_200, integration: 50_000 },
} as const;

type CanonicalPlan = keyof typeof PLAN_LIMITS;
type SubscriptionDoc = Doc<"subscriptions">;
type CreditType = "message" | "integration";

const paidPlanValidator = v.union(
  v.literal("starter"),
  v.literal("builder"),
  v.literal("pro"),
  v.literal("elite"),
  // Accepted during migration from Cryzo's previous plan names.
  v.literal("pro_plus"),
  v.literal("business"),
);

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

/**
 * Existing Cryzo users may still have the old `pro` (100 credits) or
 * `pro_plus` (250 credits) values. Detect those by their legacy allowance so
 * nobody is silently moved to a more expensive entitlement during rollout.
 */
function normalizePlan(sub: SubscriptionDoc | null): CanonicalPlan {
  if (!sub || sub.plan === "free") return "free";
  if (sub.plan === "starter" || sub.plan === "builder" || sub.plan === "elite") {
    return sub.plan;
  }
  if (sub.plan === "pro_plus" || sub.plan === "business") return "builder";
  if (sub.plan === "pro") {
    const storedMonthly = sub.messageMonthlyCredits ?? sub.monthlyCredits ?? 0;
    return storedMonthly > 0 && storedMonthly <= 100 ? "starter" : "pro";
  }
  return "free";
}

function canonicalPaidPlan(plan: string): Exclude<CanonicalPlan, "free"> {
  if (plan === "pro_plus" || plan === "business") return "builder";
  if (plan === "starter" || plan === "builder" || plan === "pro" || plan === "elite") {
    return plan;
  }
  throw new Error("Unknown paid plan");
}

function resetFreeWindows(sub: SubscriptionDoc | null, now: number) {
  const dailyResetAt = sub?.dailyResetAt ?? nextDailyReset(now);
  const freeMonthlyResetAt = sub?.freeMonthlyResetAt ?? nextMonthlyReset(now);
  return {
    dailyCreditsUsed: dailyResetAt <= now ? 0 : (sub?.dailyCreditsUsed ?? 0),
    dailyResetAt: dailyResetAt <= now ? nextDailyReset(now) : dailyResetAt,
    freeMonthlyCreditsUsed:
      freeMonthlyResetAt <= now ? 0 : (sub?.freeMonthlyCreditsUsed ?? 0),
    freeMonthlyResetAt:
      freeMonthlyResetAt <= now ? nextMonthlyReset(now) : freeMonthlyResetAt,
  };
}

function validMessageTopUp(sub: SubscriptionDoc | null, now: number) {
  if (!sub) return 0;
  const amount = sub.messageTopUpCredits ?? sub.topUpCredits ?? 0;
  const expiresAt = sub.messageTopUpExpiresAt ?? sub.topUpExpiresAt;
  if (!amount) return 0;
  if (expiresAt && expiresAt <= now) return 0;
  return amount;
}

function validMessageTopUpExpiry(sub: SubscriptionDoc | null, now: number) {
  if (!sub) return undefined;
  const amount = validMessageTopUp(sub, now);
  if (!amount) return undefined;
  return sub.messageTopUpExpiresAt ?? sub.topUpExpiresAt;
}

function paidAccessActive(sub: SubscriptionDoc | null, now: number) {
  if (!sub) return false;
  if (sub.status === "active") return true;
  if (sub.status === "canceled" && sub.currentPeriodEnd > now) return true;
  return false;
}

function computeCredits(sub: SubscriptionDoc | null, now: number) {
  const plan = normalizePlan(sub);
  const limits = PLAN_LIMITS[plan];
  const freeWindows = resetFreeWindows(sub, now);
  const topUpCredits = validMessageTopUp(sub, now);
  const topUpExpiresAt = validMessageTopUpExpiry(sub, now);

  let messageCreditsUsed = 0;
  let messageCreditsRemaining = 0;
  let dailyCreditsRemaining = 0;

  if (plan === "free") {
    messageCreditsUsed = freeWindows.freeMonthlyCreditsUsed;
    dailyCreditsRemaining = Math.max(
      0,
      FREE_DAILY_MESSAGE_CREDITS - freeWindows.dailyCreditsUsed,
    );
    const monthlyRemaining = Math.max(
      0,
      limits.message - freeWindows.freeMonthlyCreditsUsed,
    );
    messageCreditsRemaining = Math.min(dailyCreditsRemaining, monthlyRemaining);
  } else if (sub && paidAccessActive(sub, now)) {
    messageCreditsUsed = sub.messageCreditsUsed ?? sub.creditsUsed ?? 0;
    messageCreditsRemaining =
      Math.max(0, limits.message - messageCreditsUsed) + topUpCredits;
  } else if (sub) {
    messageCreditsUsed = sub.messageCreditsUsed ?? sub.creditsUsed ?? 0;
  }

  const integrationCreditsUsed = sub?.integrationCreditsUsed ?? 0;
  const integrationCreditsRemaining =
    plan === "free" || paidAccessActive(sub, now)
      ? Math.max(0, limits.integration - integrationCreditsUsed)
      : 0;

  const status = sub?.status ?? ("active" as const);
  const currentPeriodEnd = sub?.currentPeriodEnd ?? freeWindows.freeMonthlyResetAt;

  return {
    plan,
    status,
    billingCycle: sub?.billingCycle ?? ("monthly" as const),
    currentPeriodEnd,
    stripeCustomerId: sub?.stripeCustomerId,
    stripeSubscriptionId: sub?.stripeSubscriptionId,

    messageMonthlyCredits: limits.message,
    messageCreditsUsed,
    messageCreditsRemaining,
    messageTopUpCredits: topUpCredits,
    messageTopUpExpiresAt: topUpExpiresAt,

    integrationMonthlyCredits: limits.integration,
    integrationCreditsUsed,
    integrationCreditsRemaining,

    dailyCreditsUsed: plan === "free" ? freeWindows.dailyCreditsUsed : 0,
    dailyCreditsRemaining: plan === "free" ? dailyCreditsRemaining : 0,
    dailyResetAt: freeWindows.dailyResetAt,
    freeMonthlyCreditsUsed:
      plan === "free" ? freeWindows.freeMonthlyCreditsUsed : 0,
    freeMonthlyRemaining:
      plan === "free"
        ? Math.max(0, limits.message - freeWindows.freeMonthlyCreditsUsed)
        : 0,
    freeMonthlyResetAt: freeWindows.freeMonthlyResetAt,

    // Backward-compatible aliases consumed by older UI code while this rollout
    // is live. They intentionally refer to MESSAGE credits.
    monthlyCredits: limits.message,
    creditsUsed: messageCreditsUsed,
    creditsRemaining: messageCreditsRemaining,
    rolloverCredits: 0,
    topUpCredits,
    topUpExpiresAt,
    billingCreditsTotal: limits.message + topUpCredits,
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
    billingCycle: "monthly",
    status: "active",
    currentPeriodEnd: nextMonthlyReset(now),
    monthlyCredits: PLAN_LIMITS.free.message,
    creditsUsed: 0,
    rolloverCredits: 0,
    topUpCredits: 0,
    messageMonthlyCredits: PLAN_LIMITS.free.message,
    messageCreditsUsed: 0,
    messageRolloverCredits: 0,
    messageTopUpCredits: 0,
    integrationMonthlyCredits: PLAN_LIMITS.free.integration,
    integrationCreditsUsed: 0,
    dailyCreditsUsed: 0,
    dailyResetAt: nextDailyReset(now),
    freeMonthlyCreditsUsed: 0,
    freeMonthlyResetAt: nextMonthlyReset(now),
    createdAt: now,
    updatedAt: now,
  });
  return await ctx.db.get(id);
}

async function ensureSubscription(
  ctx: MutationCtx,
  userId: Id<"users">,
  now: number,
) {
  let sub = await findSubscription(ctx, userId);
  if (!sub) sub = await createFreeSubscription(ctx, userId, now);
  if (!sub) throw new Error("Unable to create subscription");
  return sub;
}

async function insertLedger(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    creditType: CreditType;
    amount: number;
    balance: number;
    reason: string;
    description?: string;
    providerId?: string;
    modelId?: string;
    toolName?: string;
    stripeEventId?: string;
    messageId?: Id<"messages">;
  },
) {
  await ctx.db.insert("creditLedger", {
    userId: args.userId,
    creditType: args.creditType,
    amount: args.amount,
    balance: args.balance,
    reason: args.reason,
    description: args.description,
    providerId: args.providerId,
    modelId: args.modelId,
    toolName: args.toolName,
    stripeEventId: args.stripeEventId,
    messageId: args.messageId,
    createdAt: Date.now(),
  });
}

export const getSubscription = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    return computeCredits(sub, Date.now());
  },
});

export const hasMessageCredits = query({
  args: { userId: v.id("users"), amount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    const amount = Math.max(0, args.amount ?? 1);
    return computeCredits(sub, Date.now()).messageCreditsRemaining >= amount;
  },
});

export const hasIntegrationCredits = query({
  args: { userId: v.id("users"), amount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    const amount = Math.max(0, args.amount ?? 1);
    return computeCredits(sub, Date.now()).integrationCreditsRemaining >= amount;
  },
});

// Legacy alias: single-credit clients are treated as message-credit clients.
export const hasCredits = query({
  args: { userId: v.id("users"), amount: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const sub = await findSubscription(ctx, args.userId);
    const amount = Math.max(0, args.amount ?? 1);
    return computeCredits(sub, Date.now()).messageCreditsRemaining >= amount;
  },
});

export const getCreditHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("creditLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(40);
  },
});

type MessageDeductionArgs = {
  userId: Id<"users">;
  amount: number;
  reason?: string;
  description?: string;
  providerId?: string;
  modelId?: string;
  messageId?: Id<"messages">;
};

async function deductMessage(ctx: MutationCtx, args: MessageDeductionArgs) {
  const now = Date.now();
  const amount = Math.max(0, args.amount);
  const sub = await ensureSubscription(ctx, args.userId, now);
  const current = computeCredits(sub, now);
  if (amount === 0) return { success: true, remaining: current.messageCreditsRemaining };
  if (current.messageCreditsRemaining < amount) {
    return { success: false, remaining: current.messageCreditsRemaining };
  }

  let remaining = current.messageCreditsRemaining;

  if (current.plan === "free") {
    const windows = resetFreeWindows(sub, now);
    const nextDailyUsed = windows.dailyCreditsUsed + amount;
    const nextMonthlyUsed = windows.freeMonthlyCreditsUsed + amount;
    const monthlyRemaining = Math.max(0, PLAN_LIMITS.free.message - nextMonthlyUsed);
    remaining = Math.min(
      Math.max(0, FREE_DAILY_MESSAGE_CREDITS - nextDailyUsed),
      monthlyRemaining,
    );
    await ctx.db.patch(sub._id, {
      dailyCreditsUsed: nextDailyUsed,
      dailyResetAt: windows.dailyResetAt,
      freeMonthlyCreditsUsed: nextMonthlyUsed,
      freeMonthlyResetAt: windows.freeMonthlyResetAt,
      messageCreditsUsed: nextMonthlyUsed,
      creditsUsed: nextMonthlyUsed,
      messageMonthlyCredits: PLAN_LIMITS.free.message,
      monthlyCredits: PLAN_LIMITS.free.message,
      updatedAt: now,
    });
  } else {
    const baseRemaining = Math.max(
      0,
      current.messageMonthlyCredits - current.messageCreditsUsed,
    );
    const baseDeduction = Math.min(amount, baseRemaining);
    const topUpDeduction = amount - baseDeduction;
    const nextUsed = current.messageCreditsUsed + baseDeduction;
    const nextTopUp = Math.max(0, current.messageTopUpCredits - topUpDeduction);
    remaining =
      Math.max(0, current.messageMonthlyCredits - nextUsed) + nextTopUp;

    await ctx.db.patch(sub._id, {
      messageMonthlyCredits: current.messageMonthlyCredits,
      messageCreditsUsed: nextUsed,
      messageTopUpCredits: nextTopUp,
      messageTopUpExpiresAt: nextTopUp ? current.messageTopUpExpiresAt : undefined,
      // Mirror to legacy fields during migration.
      monthlyCredits: current.messageMonthlyCredits,
      creditsUsed: nextUsed,
      topUpCredits: nextTopUp,
      topUpExpiresAt: nextTopUp ? current.messageTopUpExpiresAt : undefined,
      rolloverCredits: 0,
      messageRolloverCredits: 0,
      updatedAt: now,
    });
  }

  await insertLedger(ctx, {
    userId: args.userId,
    creditType: "message",
    amount: -amount,
    balance: remaining,
    reason: args.reason ?? "message",
    description: args.description,
    providerId: args.providerId,
    modelId: args.modelId,
    messageId: args.messageId,
  });
  return { success: true, remaining };
}

export const deductMessageCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
    description: v.optional(v.string()),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => deductMessage(ctx, args),
});

// Legacy alias.
export const deductCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
    description: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
  },
  handler: async (ctx, args) => deductMessage(ctx, args),
});

export const deductIntegrationCredits = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.optional(v.string()),
    description: v.optional(v.string()),
    toolName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const amount = Math.max(0, args.amount);
    const sub = await ensureSubscription(ctx, args.userId, now);
    const current = computeCredits(sub, now);
    if (amount === 0) {
      return { success: true, remaining: current.integrationCreditsRemaining };
    }
    if (current.integrationCreditsRemaining < amount) {
      return { success: false, remaining: current.integrationCreditsRemaining };
    }

    const nextUsed = current.integrationCreditsUsed + amount;
    const remaining = Math.max(
      0,
      current.integrationMonthlyCredits - nextUsed,
    );
    await ctx.db.patch(sub._id, {
      integrationMonthlyCredits: current.integrationMonthlyCredits,
      integrationCreditsUsed: nextUsed,
      updatedAt: now,
    });
    await insertLedger(ctx, {
      userId: args.userId,
      creditType: "integration",
      amount: -amount,
      balance: remaining,
      reason: args.reason ?? "integration",
      description: args.description,
      toolName: args.toolName,
    });
    return { success: true, remaining };
  },
});

export const createSubscription = mutation({
  args: {
    userId: v.id("users"),
    plan: paidPlanValidator,
    billingCycle: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    currentPeriodEnd: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await findSubscription(ctx, args.userId);
    const plan = canonicalPaidPlan(args.plan);
    const limits = PLAN_LIMITS[plan];
    const existingTopUp = validMessageTopUp(existing, now);
    const existingTopUpExpiry = validMessageTopUpExpiry(existing, now);

    if (
      existing?.stripeSubscriptionId &&
      existing.stripeSubscriptionId === args.stripeSubscriptionId &&
      normalizePlan(existing) === plan
    ) {
      await ctx.db.patch(existing._id, {
        plan,
        billingCycle: args.billingCycle ?? existing.billingCycle ?? "monthly",
        stripeCustomerId: args.stripeCustomerId ?? existing.stripeCustomerId,
        currentPeriodEnd: args.currentPeriodEnd,
        status: "active",
        messageMonthlyCredits: limits.message,
        integrationMonthlyCredits: limits.integration,
        monthlyCredits: limits.message,
        updatedAt: now,
      });
      return { success: true, duplicate: true };
    }

    const patch = {
      plan,
      billingCycle: args.billingCycle ?? ("monthly" as const),
      stripeCustomerId: args.stripeCustomerId ?? existing?.stripeCustomerId,
      stripeSubscriptionId:
        args.stripeSubscriptionId ?? existing?.stripeSubscriptionId,
      status: "active" as const,
      currentPeriodEnd: args.currentPeriodEnd,
      monthlyCredits: limits.message,
      creditsUsed: 0,
      rolloverCredits: 0,
      rolloverExpiresAt: undefined,
      topUpCredits: existingTopUp,
      topUpExpiresAt: existingTopUp ? existingTopUpExpiry : undefined,
      messageMonthlyCredits: limits.message,
      messageCreditsUsed: 0,
      messageRolloverCredits: 0,
      messageRolloverExpiresAt: undefined,
      messageTopUpCredits: existingTopUp,
      messageTopUpExpiresAt: existingTopUp ? existingTopUpExpiry : undefined,
      integrationMonthlyCredits: limits.integration,
      integrationCreditsUsed: 0,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("subscriptions", {
        userId: args.userId,
        ...patch,
        dailyCreditsUsed: 0,
        dailyResetAt: nextDailyReset(now),
        freeMonthlyCreditsUsed: 0,
        freeMonthlyResetAt: nextMonthlyReset(now),
        createdAt: now,
      });
    }

    await insertLedger(ctx, {
      userId: args.userId,
      creditType: "message",
      amount: limits.message,
      balance: limits.message + existingTopUp,
      reason: "subscription",
      description: `${plan} message credits`,
    });
    await insertLedger(ctx, {
      userId: args.userId,
      creditType: "integration",
      amount: limits.integration,
      balance: limits.integration,
      reason: "subscription",
      description: `${plan} integration credits`,
    });

    return { success: true, duplicate: false };
  },
});

export const updateSubscriptionByStripe = mutation({
  args: {
    stripeSubscriptionId: v.string(),
    plan: v.optional(paidPlanValidator),
    billingCycle: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
    status: v.optional(
      v.union(v.literal("active"), v.literal("canceled"), v.literal("past_due")),
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

    const plan = args.plan
      ? canonicalPaidPlan(args.plan)
      : normalizePlan(sub) === "free"
        ? "starter"
        : (normalizePlan(sub) as Exclude<CanonicalPlan, "free">);
    const limits = PLAN_LIMITS[plan];
    await ctx.db.patch(sub._id, {
      plan,
      billingCycle: args.billingCycle ?? sub.billingCycle ?? "monthly",
      messageMonthlyCredits: limits.message,
      integrationMonthlyCredits: limits.integration,
      monthlyCredits: limits.message,
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
      if (existingLedger) return { success: true, duplicate: true };
    }

    const sub = await ctx.db
      .query("subscriptions")
      .withIndex("by_stripe_subscription", (q) =>
        q.eq("stripeSubscriptionId", args.stripeSubscriptionId),
      )
      .unique();
    if (!sub) return { success: false };

    const plan = normalizePlan(sub);
    if (plan === "free") return { success: false };
    const limits = PLAN_LIMITS[plan];
    const topUpCredits = validMessageTopUp(sub, now);
    const topUpExpiresAt = validMessageTopUpExpiry(sub, now);

    await ctx.db.patch(sub._id, {
      monthlyCredits: limits.message,
      creditsUsed: 0,
      rolloverCredits: 0,
      topUpCredits,
      topUpExpiresAt: topUpCredits ? topUpExpiresAt : undefined,
      messageMonthlyCredits: limits.message,
      messageCreditsUsed: 0,
      messageRolloverCredits: 0,
      messageTopUpCredits: topUpCredits,
      messageTopUpExpiresAt: topUpCredits ? topUpExpiresAt : undefined,
      integrationMonthlyCredits: limits.integration,
      integrationCreditsUsed: 0,
      currentPeriodEnd: args.currentPeriodEnd ?? sub.currentPeriodEnd,
      updatedAt: now,
    });

    await insertLedger(ctx, {
      userId: sub.userId,
      creditType: "message",
      amount: limits.message,
      balance: limits.message + topUpCredits,
      reason: "renewal",
      description: "Monthly message credits reset",
      stripeEventId: args.stripeEventId,
    });
    await insertLedger(ctx, {
      userId: sub.userId,
      creditType: "integration",
      amount: limits.integration,
      balance: limits.integration,
      reason: "renewal",
      description: "Monthly integration credits reset",
    });

    return { success: true, duplicate: false };
  },
});

/** Paid message-credit top-ups. Top-ups remain valid for 12 months. */
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
      if (existingLedger) return { success: true, duplicate: true };
    }

    const sub = await ensureSubscription(ctx, args.userId, now);
    const current = computeCredits(sub, now);
    const amount = Math.max(0, args.amount);
    const nextTopUp = current.messageTopUpCredits + amount;
    const expiresAt = Math.max(current.messageTopUpExpiresAt ?? 0, now + YEAR);
    const balance = current.messageCreditsRemaining + amount;

    await ctx.db.patch(sub._id, {
      messageTopUpCredits: nextTopUp,
      messageTopUpExpiresAt: expiresAt,
      topUpCredits: nextTopUp,
      topUpExpiresAt: expiresAt,
      updatedAt: now,
    });
    await insertLedger(ctx, {
      userId: args.userId,
      creditType: "message",
      amount,
      balance,
      reason: args.reason,
      description: args.description,
      stripeEventId: args.stripeEventId,
    });
    return { success: true, duplicate: false };
  },
});

export const recordStripeEvent = mutation({
  args: { eventId: v.string(), eventType: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedStripeEvents")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .unique();
    if (existing) return { alreadyProcessed: true };
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
    return Boolean(existing);
  },
});
