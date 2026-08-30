import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  ...authTables,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    firebaseUid: v.optional(v.string()),
    createdAt: v.optional(v.number()),
  }).index("email", ["email"]),

  conversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    chatMode: v.optional(v.union(v.literal("build"), v.literal("plan"))),
    composioSessionId: v.union(v.string(), v.null()),
    modelProvider: v.optional(v.string()),
    modelId: v.optional(v.string()),
    modelCredentialMode: v.optional(
      v.union(v.literal("cryzo"), v.literal("device"), v.literal("account")),
    ),
    modelBaseUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    parts: v.optional(v.any()),
    toolCalls: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  artifacts: defineTable({
    conversationId: v.id("conversations"),
    artifactId: v.string(),
    title: v.string(),
    actions: v.array(
      v.object({
        type: v.union(
          v.literal("file"),
          v.literal("shell"),
          v.literal("start"),
          v.literal("supabase"),
        ),
        filePath: v.optional(v.string()),
        operation: v.optional(v.union(v.literal("migration"), v.literal("query"))),
        content: v.string(),
      }),
    ),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  publishTargets: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    provider: v.union(v.literal("netlify"), v.literal("cryzo")),
    targetId: v.string(),
    slug: v.optional(v.string()),
    url: v.optional(v.string()),
    deploymentId: v.optional(v.string()),
    customDomain: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_conversation_provider", [
      "userId",
      "conversationId",
      "provider",
    ])
    .index("by_provider_slug", ["provider", "slug"]),

  mobileBuilds: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    platform: v.union(v.literal("ios"), v.literal("android")),
    expoProjectId: v.optional(v.string()),
    buildId: v.optional(v.string()),
    buildUrl: v.optional(v.string()),
    artifactUrl: v.optional(v.string()),
    status: v.string(),
    appName: v.string(),
    identifier: v.string(),
    webUrl: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_conversation", ["userId", "conversationId", "updatedAt"])
    .index("by_build_id", ["buildId"]),

  providerSecrets: defineTable({
    userId: v.id("users"),
    providerId: v.string(),
    ciphertext: v.string(),
    iv: v.string(),
    tag: v.string(),
    baseUrl: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_provider", ["userId", "providerId"]),

  subscriptions: defineTable({
    userId: v.id("users"),
    plan: v.union(
      v.literal("free"),
      v.literal("pro"),
      v.literal("pro_plus"),
      v.literal("business"),
    ),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("canceled"),
      v.literal("past_due"),
    ),
    currentPeriodEnd: v.number(),
    monthlyCredits: v.number(),
    creditsUsed: v.number(),
    rolloverCredits: v.number(),
    rolloverExpiresAt: v.optional(v.number()),
    topUpCredits: v.optional(v.number()),
    topUpExpiresAt: v.optional(v.number()),
    dailyCreditsUsed: v.optional(v.number()),
    dailyResetAt: v.optional(v.number()),
    freeMonthlyCreditsUsed: v.optional(v.number()),
    freeMonthlyResetAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"])
    .index("by_stripe_subscription", ["stripeSubscriptionId"]),

  creditLedger: defineTable({
    userId: v.id("users"),
    amount: v.number(),
    balance: v.number(),
    reason: v.string(),
    description: v.optional(v.string()),
    stripeEventId: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_stripe_event", ["stripeEventId"]),

  processedStripeEvents: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    createdAt: v.number(),
  }).index("by_event", ["eventId"]),
});
