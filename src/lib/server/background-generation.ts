import type { ConvexHttpClient } from "convex/browser";
import { parseGenerationFrame } from "./stream-events";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/** Consume the server-side copy of an AI UI stream. Never persist provider credentials. */
export async function checkpointGenerationStream(
  stream: ReadableStream<Uint8Array>,
  client: ConvexHttpClient,
  jobId: Id<"generationJobs">,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let lastCheckpoint = Date.now();
  let lastLength = 0;
  const flush = async (status: "running" | "complete" | "failed", error?: string) => {
    await client.mutation(api.generationJobs.checkpoint, {
      id: jobId, text: text.slice(0, 300000), status, ...(error ? { error } : {}),
    });
    lastCheckpoint = Date.now();
    lastLength = text.length;
  };
  const parseEvent = (line: string) => {
    const frame = parseGenerationFrame(line);
    if (frame.error) throw new Error(frame.error);
    if (frame.delta) text += frame.delta;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        parseEvent(line);
      }
      if (text.length !== lastLength && (Date.now() - lastCheckpoint >= 1100 || text.length - lastLength > 12000)) {
        await flush("running");
      }
      if (done) break;
    }
    if (buffer) parseEvent(buffer);
    await flush("complete");
  } catch (error) {
    try { await flush("failed", error instanceof Error ? error.message : String(error)); }
    catch { /* A lost Convex connection must not leak credentials or crash the user request. */ }
  } finally { reader.releaseLock(); }
}
