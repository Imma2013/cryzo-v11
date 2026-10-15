import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireService } from "./jobAccess";
const kind = v.union(v.literal("generation"), v.literal("expo"));
const encrypted = { ciphertext: v.string(), iv: v.string(), tag: v.string() };
const state = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("cancelled"),
);
const publicTask = v.object({
  id: v.id("durableTasks"),
  status: state,
  phase: v.string(),
  key: v.string(),
  resultJson: v.optional(v.string()),
  error: v.optional(v.string()),
  generationJobId: v.optional(v.id("generationJobs")),
});
export const enqueue = mutation({
  args: {
    conversationId: v.id("conversations"),
    kind,
    key: v.string(),
    ...encrypted,
  },
  returns: v.object({
    id: v.id("durableTasks"),
    created: v.boolean(),
    generationJobId: v.optional(v.id("generationJobs")),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const conversation = await ctx.db.get(args.conversationId);
    if (!userId || conversation?.userId !== userId)
      throw new Error("Conversation not found");
    if (args.ciphertext.length > 950000)
      throw new Error(
        "This request is too large. Reduce the attachments and retry.",
      );
    const prior = await ctx.db
      .query("durableTasks")
      .withIndex("by_conversation_kind_key", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("kind", args.kind)
          .eq("key", args.key),
      )
      .order("desc")
      .first();
    if (
      prior &&
      prior.status !== "failed" &&
      prior.status !== "cancelled" &&
      (args.kind === "generation" ||
        prior.status === "queued" ||
        prior.status === "running")
    )
      return {
        id: prior._id,
        created: false,
        ...(prior.generationJobId
          ? { generationJobId: prior.generationJobId }
          : {}),
      };
    // Never run two installers or two builds for the same conversation concurrently.
    for (const status of ["queued", "running"] as const) {
      const active = await ctx.db
        .query("durableTasks")
        .withIndex("by_conversation_kind_status", (q) =>
          q
            .eq("conversationId", args.conversationId)
            .eq("kind", args.kind)
            .eq("status", status),
        )
        .first();
      if (active && active.expiresAt > Date.now())
        return {
          id: active._id,
          created: false,
          ...(active.generationJobId
            ? { generationJobId: active.generationJobId }
            : {}),
        };
    }
    const now = Date.now();
    const id = await ctx.db.insert("durableTasks", {
      ...args,
      userId,
      status: "queued",
      phase: "Queued",
      createdAt: now,
      updatedAt: now,
      expiresAt: now + 3600000,
    });
    let generationJobId;
    if (args.kind === "generation") {
      generationJobId = await ctx.db.insert("generationJobs", {
        conversationId: args.conversationId,
        userId,
        promptId: args.key,
        taskId: id,
        status: "running",
        text: "",
        sequence: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(id, { generationJobId });
    }
    await ctx.scheduler.runAfter(3600000, internal.durableTasks.expire, { id });
    return {
      id,
      created: true,
      ...(generationJobId ? { generationJobId } : {}),
    };
  },
});
export const status = query({
  args: { id: v.id("durableTasks") },
  returns: v.union(publicTask, v.null()),
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task || task.userId !== (await getAuthUserId(ctx))) return null;
    return {
      id: task._id,
      status: task.status,
      phase: task.phase,
      key: task.key,
      ...(task.resultJson ? { resultJson: task.resultJson } : {}),
      ...(task.error ? { error: task.error } : {}),
      ...(task.generationJobId
        ? { generationJobId: task.generationJobId }
        : {}),
    };
  },
});
export const context = query({
  args: { id: v.id("durableTasks"), internalSecret: v.string() },
  returns: v.any(),
  handler: async (ctx, args) => {
    requireService(args.internalSecret);
    const task = await ctx.db.get(args.id);
    if (
      !task ||
      task.expiresAt <= Date.now() ||
      !["queued", "running"].includes(task.status)
    )
      return null;
    return task;
  },
});
export const claim = mutation({
  args: {
    id: v.id("durableTasks"),
    internalSecret: v.string(),
    attempt: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireService(args.internalSecret);
    const task = await ctx.db.get(args.id);
    if (!task || task.status !== "queued" || task.expiresAt <= Date.now())
      return false;
    await ctx.db.patch(task._id, {
      status: "running",
      attempt: args.attempt,
      phase: "Starting",
      updatedAt: Date.now(),
    });
    return true;
  },
});
export const update = mutation({
  args: {
    id: v.id("durableTasks"),
    internalSecret: v.string(),
    attempt: v.optional(v.string()),
    phase: v.string(),
    status: v.optional(state),
    runId: v.optional(v.string()),
    resultJson: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireService(args.internalSecret);
    const task = await ctx.db.get(args.id);
    if (
      !task ||
      !["queued", "running"].includes(task.status) ||
      (args.attempt && args.attempt !== task.attempt)
    )
      return false;
    const terminal =
      args.status && !["queued", "running"].includes(args.status);
    await ctx.db.patch(task._id, {
      phase: args.phase,
      ...(args.status ? { status: args.status } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.resultJson ? { resultJson: args.resultJson } : {}),
      ...(args.error ? { error: args.error.slice(0, 1000) } : {}),
      ...(terminal
        ? { ciphertext: undefined, iv: undefined, tag: undefined }
        : {}),
      updatedAt: Date.now(),
    });
    if (task.generationJobId && terminal && args.status !== "complete")
      await ctx.db.patch(task.generationJobId, {
        status: args.status === "cancelled" ? "cancelled" : "failed",
        error: args.error,
        updatedAt: Date.now(),
      });
    return true;
  },
});
export const cancel = mutation({
  args: { id: v.id("durableTasks") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task || task.userId !== (await getAuthUserId(ctx)))
      throw new Error("Task not found");
    if (["queued", "running"].includes(task.status)) {
      await ctx.db.patch(id, {
        status: "cancelled",
        phase: "Cancelled",
        ciphertext: undefined,
        iv: undefined,
        tag: undefined,
        updatedAt: Date.now(),
      });
      if (task.generationJobId)
        await ctx.db.patch(task.generationJobId, {
          status: "cancelled",
          updatedAt: Date.now(),
        });
    }
    return null;
  },
});
export const expire = internalMutation({
  args: { id: v.id("durableTasks") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const task = await ctx.db.get(id);
    if (!task) return null;
    const active = ["queued", "running"].includes(task.status);
    await ctx.db.patch(id, {
      ciphertext: undefined,
      iv: undefined,
      tag: undefined,
      ...(active
        ? {
            status: "failed" as const,
            phase: "Expired",
            error: "This build reached its time limit. Retry to continue.",
          }
        : {}),
      updatedAt: Date.now(),
    });
    if (active && task.generationJobId)
      await ctx.db.patch(task.generationJobId, {
        status: "failed",
        error: "Build time limit reached. Retry to continue.",
        updatedAt: Date.now(),
      });
    return null;
  },
});
