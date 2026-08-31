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
    projectPlatforms: v.optional(
      v.array(v.union(v.literal("web"), v.literal("ios"), v.literal("android"))),
    ),
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

  appBackends: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    provider: v.literal("convex"),
    projectId: v.number(),
    projectName: v.string(),
    deploymentName: v.string(),
    deploymentUrl: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user_conversation", ["userId", "conversationId"])
    .index("by_project_id", ["projectId"]),

  cloudApps: defineTable({
    ownerUserId: v.id("users"),
    conversationId: v.id("conversations"),
    name: v.string(),
    authProviders: v.optional(
      v.array(v.union(v.literal("password"), v.literal("google"))),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_conversation", ["ownerUserId", "conversationId"])
    .index("by_conversation", ["conversationId"]),

  cloudEntitySchemas: defineTable({
    appId: v.id("cloudApps"),
    name: v.string(),
    fields: v.optional(v.any()),
    access: v.union(
      v.literal("private"),
      v.literal("public-read"),
      v.literal("public"),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_app_name", ["appId", "name"]),

  cloudAppUsers: defineTable({
    appId: v.id("cloudApps"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("admin")),
    passwordHash: v.optional(v.string()),
    passwordSalt: v.optional(v.string()),
    authProvider: v.optional(v.union(v.literal("password"), v.literal("google"))),
    providerSubject: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_app_email", ["appId", "email"])
    .index("by_app_provider_subject", ["appId", "authProvider", "providerSubject"])
    .index("by_app", ["appId", "createdAt"]),

  cloudSessions: defineTable({
    appId: v.id("cloudApps"),
    appUserId: v.id("cloudAppUsers"),
    token: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_app_user", ["appId", "appUserId"]),

  cloudRecords: defineTable({
    appId: v.id("cloudApps"),
    entityName: v.string(),
    ownerAppUserId: v.optional(v.id("cloudAppUsers")),
    data: v.any(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_app_entity", ["appId", "entityName", "createdAt"])
    .index("by_app_entity_owner", ["appId", "entityName", "ownerAppUserId", "createdAt"]),

  cloudUsageEvents: defineTable({
    appId: v.id("cloudApps"),
    ownerUserId: v.id("users"),
    category: v.union(
      v.literal("database"),
      v.literal("auth"),
      v.literal("storage"),
      v.literal("function"),
      v.literal("integration"),
    ),
    operation: v.string(),
    credits: v.number(),
    detail: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_app", ["appId", "createdAt"])
    .index("by_owner", ["ownerUserId", "createdAt"]),

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
      v.literal("starter"),
      v.literal("builder"),
      v.literal("pro"),
      v.literal("elite"),
      v.literal("pro_plus"),
      v.literal("business"),
    ),
    billingCycle: v.optional(v.union(v.literal("monthly"), v.literal("yearly"))),
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
    messageMonthlyCredits: v.optional(v.number()),
    messageCreditsUsed: v.optional(v.number()),
    messageRolloverCredits: v.optional(v.number()),
    messageRolloverExpiresAt: v.optional(v.number()),
    messageTopUpCredits: v.optional(v.number()),
    messageTopUpExpiresAt: v.optional(v.number()),
    integrationMonthlyCredits: v.optional(v.number()),
    integrationCreditsUsed: v.optional(v.number()),
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
    creditType: v.optional(v.union(v.literal("message"), v.literal("integration"))),
    amount: v.number(),
    balance: v.number(),
    reason: v.string(),
    description: v.optional(v.string()),
    providerId: v.optional(v.string()),
    modelId: v.optional(v.string()),
    toolName: v.optional(v.string()),
    stripeEventId: v.optional(v.string()),
    messageId: v.optional(v.id("messages")),
    createdAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),

  stripeEvents: defineTable({
    eventId: v.string(),
    type: v.string(),
    processedAt: v.number(),
  }).index("by_event_id", ["eventId"]),
});
