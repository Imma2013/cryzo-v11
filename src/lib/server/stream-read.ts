export function readStreamPart<T>(reader: ReadableStreamDefaultReader<T>, signal: AbortSignal): Promise<ReadableStreamReadResult<T>> {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      reject(signal.reason ?? new Error("Generation was cancelled."));
      void reader.cancel().catch(() => undefined);
    };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    reader.read().then(resolve, reject).finally(() => signal.removeEventListener("abort", aborted));
  });
}
