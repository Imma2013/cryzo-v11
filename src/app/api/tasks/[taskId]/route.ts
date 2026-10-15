import { ConvexHttpClient } from "convex/browser";
import { getRun } from "workflow/api";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
export const runtime = "nodejs";
function client(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Unauthorized");
  const db = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  db.setAuth(token);
  return db;
}
export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const db = client(req);
    const task = await db.query(api.durableTasks.status, {
      id: taskId as Id<"durableTasks">,
    });
    if (!task)
      return Response.json({ error: "Task not found" }, { status: 404 });
    return Response.json(task, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
}
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const db = client(req);
    const id = taskId as Id<"durableTasks">;
    const task = await db.query(api.durableTasks.status, { id });
    if (!task)
      return Response.json({ error: "Task not found" }, { status: 404 });
    const context = await db.query(api.durableTasks.context, {
      id,
      internalSecret: process.env.CRYZO_INTERNAL_API_SECRET!,
    });
    await db.mutation(api.durableTasks.cancel, { id });
    if (context?.runId)
      await getRun(context.runId)
        .cancel()
        .catch(() => {});
    return Response.json({ cancelled: true });
  } catch {
    return Response.json({ error: "Unable to cancel build" }, { status: 400 });
  }
}
