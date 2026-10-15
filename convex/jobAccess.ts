import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
export const jobAccessValidator = v.object({
  taskId: v.id("durableTasks"),
  internalSecret: v.string(),
});
export type JobAccess = { taskId: Id<"durableTasks">; internalSecret: string };
export function requireService(secret: string) {
  if (
    !process.env.CRYZO_INTERNAL_API_SECRET ||
    secret !== process.env.CRYZO_INTERNAL_API_SECRET
  )
    throw new Error("Unauthorized");
}
export async function conversationUser(
  ctx: QueryCtx | MutationCtx,
  conversationId: Id<"conversations">,
  access?: JobAccess,
) {
  if (!access) return await getAuthUserId(ctx);
  requireService(access.internalSecret);
  const task = await ctx.db.get(access.taskId);
  if (
    !task ||
    task.conversationId !== conversationId ||
    task.status !== "running" ||
    task.expiresAt <= Date.now()
  )
    throw new Error("Job is no longer active");
  return task.userId;
}
