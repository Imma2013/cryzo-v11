import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Browser transport is disposable; the workflow remains the owner of generation. */
export function taskStream(
  task: { id: Id<"durableTasks">; generationJobId?: Id<"generationJobs"> },
  token: string,
  signal: AbortSignal,
) {
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown) => {
        if (!cancelled && !signal.aborted)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(value)}\n\n`),
          );
      };
      let length = 0;
      const toolStates = new Map<string, string>();
      try {
        send({ type: "start", messageId: `recovered:${task.generationJobId}` });
        send({ type: "text-start", id: "build" });
        while (!cancelled && !signal.aborted) {
          const [state, job] = await Promise.all([
            client.query(api.durableTasks.status, { id: task.id }),
            task.generationJobId
              ? client.query(api.generationJobs.get, {
                  id: task.generationJobId,
                })
              : null,
          ]);
          if (!state) throw new Error("Build not found");
          for (const part of JSON.parse(job?.partsJson || "[]")) {
            const previous = toolStates.get(part.toolCallId);
            if (!previous)
              send({
                type: "tool-input-available",
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                input: part.input,
                dynamic: true,
              });
            if (previous !== part.state && part.state === "output-available")
              send({
                type: "tool-output-available",
                toolCallId: part.toolCallId,
                output: part.output,
                dynamic: true,
              });
            if (previous !== part.state && part.state === "output-error")
              send({
                type: "tool-output-error",
                toolCallId: part.toolCallId,
                errorText: part.errorText,
                dynamic: true,
              });
            toolStates.set(part.toolCallId, part.state);
          }
          if (job && job.text.length > length) {
            send({
              type: "text-delta",
              id: "build",
              delta: job.text.slice(length),
            });
            length = job.text.length;
          }
          if (state.status === "failed")
            throw new Error(
              state.error || "The build stopped. Retry to continue.",
            );
          if (state.status === "complete" || state.status === "cancelled") {
            send({ type: "text-end", id: "build" });
            send({ type: "finish" });
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        send({
          type: "error",
          errorText:
            error instanceof Error
              ? error.message
              : "Reconnecting to your build…",
        });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-cryzo-generation-job": String(task.generationJobId),
    },
  });
}
