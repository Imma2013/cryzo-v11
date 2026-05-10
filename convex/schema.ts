import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    firebaseUid: v.string(),
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index("by_firebase_uid", ["firebaseUid"]),

  conversations: defineTable({
    userId: v.id("users"),
    title: v.string(),
    composioSessionId: v.union(v.string(), v.null()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "updatedAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    toolCalls: v.optional(v.any()),
    createdAt: v.number(),
  }).index("by_conversation", ["conversationId", "createdAt"]),
});
