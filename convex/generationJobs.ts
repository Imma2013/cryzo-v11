import { requireService } from "./jobAccess";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

const status = v.union(
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("cancelled"),
);

async function owned(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
) {
  const authUserId = await getAuthUserId(ctx);
  const conversation = await ctx.db.get(conversationId);
  if (!authUserId || !conversation || conversation.userId !== authUserId)
    throw new Error("Not authorized for this conversation");
  return authUserId;
}

export const start = mutation({
  args: { conversationId: v.id("conversations"), promptId: v.string() },
  handler: async (ctx, args) => {
    const userId = await owned(ctx, args.conversationId);
    const prior = await ctx.db
      .query("generationJobs")
      .withIndex("by_conversation_prompt", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("promptId", args.promptId),
      )
      .first();
    if (prior) return prior._id;
    const now = Date.now();
    return ctx.db.insert("generationJobs", {
      conversationId: args.conversationId,
      userId,
      promptId: args.promptId,
      status: "running",
      text: "",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const checkpoint = mutation({
  args: {
    id: v.id("generationJobs"),
    text: v.string(),
    status: status,
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) throw new Error("Job not found");
    await owned(ctx, job.conversationId);
    if (job.status === "cancelled") return;
    // A late checkpoint must not regress a finished output.
    if (job.status === "complete" && args.status === "running") return;
    await ctx.db.patch(job._id, {
      text: args.text.slice(0, 300000),
      status: args.status,
      error: args.error?.slice(0, 3000),
      updatedAt: Date.now(),
    });
  },
});

export const latest = query({
  args: { conversationId: v.id("conversations") },
  handler: async (ctx, args) => {
    await owned(ctx, args.conversationId);
    return ctx.db
      .query("generationJobs")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .first();
  },
});

export const cancel = mutation({
  args: { id: v.id("generationJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.id);
    if (!job) return;
    await owned(ctx, job.conversationId);
    if (job.status === "running")
      await ctx.db.patch(job._id, {
        status: "cancelled",
        updatedAt: Date.now(),
      });
  },
});

export const get = query({
  args: { id: v.id("generationJobs") },
  returns: v.any(),
  handler: async (ctx, { id }) => {
    const job = await ctx.db.get(id);
    if (!job) return null;
    await owned(ctx, job.conversationId);
    return job;
  },
});
export const workerCheckpoint = mutation({
  args: {
    taskId: v.id("durableTasks"),
    internalSecret: v.string(),
    attempt: v.string(),
    sequence: v.number(),
    text: v.string(),
    partsJson: v.optional(v.string()),
    finished: v.boolean(),
    files: v.array(
      v.object({ index: v.number(), path: v.string(), content: v.string() }),
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireService(args.internalSecret);
    const task = await ctx.db.get(args.taskId);
    if (
      !task ||
      task.status !== "running" ||
      task.attempt !== args.attempt ||
      task.expiresAt <= Date.now() ||
      !task.generationJobId
    )
      return false;
    const job = await ctx.db.get(task.generationJobId);
    if (
      !job ||
      job.status !== "running" ||
      args.sequence <= (job.sequence ?? 0)
    )
      return false;
    if (
      new TextEncoder().encode(args.text + (args.partsJson || "[]")).length >
      800000
    )
      throw new Error("Generated response exceeds the supported size.");
    for (const file of args.files) {
      if (
        !file.path ||
        file.path.startsWith("/") ||
        file.path.split("/").includes("..")
      )
        throw new Error("Invalid generated path");
      const artifactId = `job:${job._id}:file:${file.index}`;
      const prior = await ctx.db
        .query("artifacts")
        .withIndex("by_conversation_artifact", (q) =>
          q
            .eq("conversationId", job.conversationId)
            .eq("artifactId", artifactId),
        )
        .first();
      if (!prior)
        await ctx.db.insert("artifacts", {
          conversationId: job.conversationId,
          artifactId,
          title: `Generated ${file.path}`,
          actions: [
            { type: "file", filePath: file.path, content: file.content },
          ],
          createdAt: Date.now(),
        });
    }
    await ctx.db.patch(job._id, {
      text: args.text,
      ...(args.partsJson ? { partsJson: args.partsJson } : {}),
      sequence: args.sequence,
      status: args.finished ? "complete" : "running",
      updatedAt: Date.now(),
    });
    const clientMessageId = `recovered:${job._id}`;
    const prior = await ctx.db
      .query("messages")
      .withIndex("by_conversation_client", (q) =>
        q
          .eq("conversationId", job.conversationId)
          .eq("clientMessageId", clientMessageId),
      )
      .first();
    const message = { content: args.text, partsJson: args.partsJson || "[]" };
    if (prior) await ctx.db.patch(prior._id, message);
    else
      await ctx.db.insert("messages", {
        conversationId: job.conversationId,
        clientMessageId,
        role: "assistant",
        ...message,
        createdAt: Date.now(),
      });
    return true;
  },
});
