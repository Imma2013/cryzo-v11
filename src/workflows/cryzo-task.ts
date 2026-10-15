import {
  claimTask,
  executeTask,
  completeTask,
  failTask,
  prewarmTask,
} from "@/lib/server/task-worker";

export async function runCryzoTask(taskId: string) {
  "use workflow";
  try {
    const attempt = await claimTask(taskId);
    if (!attempt) return;
    await Promise.all([executeTask(taskId, attempt), prewarmTask(taskId)]);
    await completeTask(taskId, attempt);
  } catch {
    await failTask(taskId);
  }
}
