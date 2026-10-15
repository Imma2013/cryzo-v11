import { randomUUID } from "node:crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { decryptProviderSecret } from "./provider-secrets";
import { generateChatResponse } from "./chat-handler";
import { consumeGeneration } from "./generation-consumer";
import { runExpoTask } from "./expo-task";
import { prewarmExpoDependencies } from "./mobile-handler";

function client() {
  return new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
}
function service(taskId: string) {
  return {
    id: taskId as Id<"durableTasks">,
    internalSecret: process.env.CRYZO_INTERNAL_API_SECRET!,
  };
}

export async function claimTask(taskId: string) {
  "use step";
  const attempt = randomUUID();
  const claimed = await client().mutation(api.durableTasks.claim, {
    ...service(taskId),
    attempt,
  });
  console.info("[task] claim", { taskId, claimed });
  return claimed ? attempt : null;
}

claimTask.maxRetries = 0;

export async function executeTask(taskId: string, attempt: string) {
  "use step";
  const db = client();
  const args = service(taskId);
  const task = await db.query(api.durableTasks.context, args);
  if (!task?.ciphertext || !task.iv || !task.tag)
    throw new Error("Task expired or cancelled");
  const payload = JSON.parse(
    decryptProviderSecret({
      ciphertext: task.ciphertext,
      iv: task.iv,
      tag: task.tag,
    }),
  );
  const update = async (phase: string) => {
    await db.mutation(api.durableTasks.update, { ...args, attempt, phase });
    console.info("[task] phase", { taskId, phase });
  };
  const controller = new AbortController();
  const timer = setInterval(() => {
    void db
      .query(api.durableTasks.context, args)
      .then((value) => {
        if (!value) controller.abort();
      })
      .catch(() => {});
  }, 1500);
  try {
    if (task.kind === "expo") {
      const result = await runExpoTask(payload, update, controller.signal);
      await db.mutation(api.durableTasks.update, {
        ...args,
        attempt,
        phase: "Ready",
        resultJson: JSON.stringify(result),
      });
    } else {
      await update("Planning and building");
      const response = await generateChatResponse(
        new Request("https://cryzo.internal/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        }),
        { taskId: task._id, internalSecret: args.internalSecret },
      );
      if (!response.ok || !response.body) {
        const body = await response.json().catch(() => ({}));
        throw new Error(
          body.message || body.error || "The model could not start this build.",
        );
      }
      await consumeGeneration(
        response.body,
        (checkpoint) =>
          db.mutation(api.generationJobs.workerCheckpoint, {
            taskId: task._id,
            internalSecret: args.internalSecret,
            attempt,
            ...checkpoint,
          }),
        controller.signal,
      );
    }
  } catch (error) {
    let message = error instanceof Error ? error.message : "Build interrupted";
    for (const secret of [payload.modelApiKey, args.internalSecret]) {
      if(typeof secret === "string" && secret) message=message.split(secret).join("[redacted]");
    }
    await db.mutation(api.durableTasks.update, {
      ...args,
      attempt,
      status: "failed",
      phase: "Stopped",
      error: message.replace(/Bearer\s+\S+/gi, "[redacted]").slice(0, 1000),
    });
    throw new Error("Task stopped. See its saved status for details.");
  } finally {
    clearInterval(timer);
  }
}
// Never blindly replay a paid model call or an external write after a crash.
executeTask.maxRetries = 0;

export async function completeTask(taskId: string, attempt: string) {
  "use step";
  console.info("[task] complete", { taskId });
  await client().mutation(api.durableTasks.update, {
    ...service(taskId),
    attempt,
    status: "complete",
    phase: "Ready",
  });
}

export async function failTask(taskId: string) {
  "use step";
  console.warn("[task] failed", { taskId });
  await client().mutation(api.durableTasks.update, {
    ...service(taskId),
    status: "failed",
    phase: "Stopped",
    error:
      "The build was interrupted. Saved files are preserved; retry to continue.",
  });
}

export async function prewarmTask(taskId: string) {
  "use step";
  const task = await client().query(api.durableTasks.context, service(taskId));
  if (!task?.ciphertext || !task.iv || !task.tag || task.kind !== "generation")
    return;
  const body = JSON.parse(
    decryptProviderSecret({
      ciphertext: task.ciphertext,
      iv: task.iv,
      tag: task.tag,
    }),
  );
  if (
    !body.projectPlatforms?.some((p: string) => p === "ios" || p === "android")
  )
    return;
  try {
    await prewarmExpoDependencies(task.conversationId);
    console.info("[expo] cache warm", { taskId });
  } catch {
    console.warn("[expo] cache warm skipped", { taskId });
  }
}
prewarmTask.maxRetries = 0;
