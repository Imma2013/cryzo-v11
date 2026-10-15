type Checkpoint = {
  sequence: number;
  text: string;
  partsJson?: string;
  finished: boolean;
  files: Array<{ index: number; path: string; content: string }>;
};

export function closedFiles(text: string) {
  return [
    ...text.matchAll(/<cryzoAction\b([^>]*)>([\s\S]*?)<\/cryzoAction>/g),
  ].flatMap((match, index) => {
    if (!/\btype=["']file["']/.test(match[1])) return [];
    const path = match[1].match(/\bfilePath=["']([^"']+)["']/)?.[1];
    return path ? [{ index, path, content: match[2] }] : [];
  });
}

/** EOF alone is not success. Persist files only once their action closes. */
export async function consumeGeneration(
  stream: ReadableStream<Uint8Array>,
  checkpoint: (value: Checkpoint) => Promise<boolean>,
  signal: AbortSignal,
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    text = "",
    finished = false,
    sequence = 0,
    savedIndex = -1,
    lastSaved = 0,
    lastLength = 0,
    toolVersion = 0,
    savedToolVersion = 0;
  const tools = new Map<string, any>();
  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", abort, { once: true });
  const flush = async (final = false) => {
    const files = closedFiles(text).filter((file) => file.index > savedIndex);
    // Bound each transaction even when a provider emits a very large chunk.
    for (let offset = 0; offset < Math.max(1, files.length); offset += 2) {
      const batch = files.slice(offset, offset + 2);
      if (
        !(await checkpoint({
          text,
          partsJson: JSON.stringify([...tools.values()]),
          sequence: ++sequence,
          files: batch,
          finished: final && offset + 2 >= files.length,
        }))
      )
        throw new Error("Build cancelled or superseded");
      if (batch.length) savedIndex = batch[batch.length - 1].index;
    }
    lastSaved = Date.now();
    lastLength = text.length;
    savedToolVersion = toolVersion;
  };
  const consume = (line: string) => {
    if (!line.startsWith("data: ") || line.slice(6) === "[DONE]") return;
    const event = JSON.parse(line.slice(6));
    if (event.type === "error")
      throw new Error(event.errorText || "Model generation failed");
    if (event.type.startsWith("tool-")) toolVersion++;
    if (event.type === "tool-input-available")
      tools.set(event.toolCallId, {
        type: "dynamic-tool",
        toolName: event.toolName,
        toolCallId: event.toolCallId,
        state: "input-available",
        input: event.input,
      });
    if (
      event.type === "tool-output-available" ||
      event.type === "tool-output-error"
    ) {
      const prior = tools.get(event.toolCallId);
      if (prior)
        tools.set(event.toolCallId, {
          ...prior,
          state:
            event.type === "tool-output-error"
              ? "output-error"
              : "output-available",
          ...(event.type === "tool-output-error"
            ? { errorText: event.errorText }
            : { output: event.output }),
        });
    }
    if (event.type === "text-delta") text += event.delta;
    if (event.type === "finish") finished = true;
  };
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        consume(buffer.slice(0, newline).replace(/\r$/, ""));
        buffer = buffer.slice(newline + 1);
      }
      if (
        toolVersion !== savedToolVersion ||
        (text.length !== lastLength &&
          (Date.now() - lastSaved > 1000 || text.length - lastLength > 12000))
      )
        await flush();
      if (done) break;
    }
    if (signal.aborted) throw new Error("Build cancelled");
    if (buffer) consume(buffer);
    const opens = text.match(/<cryzoArtifact\b/g)?.length || 0;
    const closes = text.match(/<\/cryzoArtifact>/g)?.length || 0;
    if (!finished || opens !== closes || (!text.trim() && !tools.size))
      throw new Error(
        "Generation was interrupted. Saved files are preserved; retry to continue.",
      );
    await flush(true);
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
