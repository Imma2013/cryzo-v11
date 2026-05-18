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
        type: v.union(v.literal("file"), v.literal("shell"), v.literal("start")),
        filePath: v.optional(v.string()),
        content: v.string(),
      })
    ),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),

  publishTargets: defineTable({
    userId: v.id("users"),
    conversationId: v.id("conversations"),
    provider: v.union(v.literal("netlify")),
    targetId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user_conversation_provider", [
    "userId",
    "conversationId",
    "provider",
  ]),
});
