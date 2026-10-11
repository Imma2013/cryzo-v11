import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const status = v.union(v.literal("running"), v.literal("complete"), v.literal("failed"), v.literal("cancelled"));

async function owned(ctx: QueryCtx | MutationCtx, conversationId: Id<"conversations">) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId) throw new Error("Not authorized for this conversation");
  return authUserId;
}

export const start = mutation({
  args: { conversationId: v.id("conversations"), promptId: v.string() },
  handler: async (ctx, args) => {
    const userId = await owned(ctx, args.conversationId);
    const prior = await ctx.db.query("generationJobs")
      .withIndex("by_conversation_prompt", (q) => q.eq("conversationId", args.conversationId).eq("promptId", args.promptId)).first();
    if (prior) return prior._id;
    const now = Date.now();
    return ctx.db.insert("generationJobs", { conversationId: args.conversationId, userId,
      promptId: args.promptId, status: "running", text: "", createdAt: now, updatedAt: now });
  },
});

export const checkpoint = mutation({
  args: { id: v.id("generationJobs"), text: v.string(), status: status, error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) throw new Error("Job not found");
    await owned(ctx, job.conversationId);
    if (job.status === "cancelled") return;
    // A late checkpoint must not regress a finished output.
    if (job.status === "complete" && args.status === "running") return;
    await ctx.db.patch(job._id, { text: args.text.slice(0, 300000), status: args.status,
      error: args.error?.slice(0, 3000), updatedAt: Date.now() });
  },
});

export const latest = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await owned(ctx, args.conversationId);
    return ctx.db.query("generationJobs")
      .withIndex("by_conversation_created", (q) => q.eq("conversationId", args.conversationId))
      .order("desc").first();
  },
});

export const cancel = mutation({
  args: { id: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return;
    await owned(ctx, job.conversationId);
    if (job.status === "running") await ctx.db.patch(job._id, { status: "cancelled", updatedAt: Date.now() });
  },
});
