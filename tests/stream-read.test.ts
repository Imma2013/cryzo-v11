import { describe, expect, it } from "vitest";
import { readStreamPart } from "../src/lib/server/stream-read";

describe("stalled stream recovery", () => {
  it("releases a read even when the underlying provider never sends another event", async () => {
    const reader = new ReadableStream<string>({ start() {} }).getReader();
    const controller = new AbortController();
    const next = readStreamPart(reader, controller.signal);
    controller.abort(new Error("First-token deadline"));
    await expect(next).rejects.toThrow("First-token deadline");
  });
  it("preserves normal streamed events", async () => {
    const reader = new ReadableStream<string>({ start(c) { c.enqueue("Hello"); c.close(); } }).getReader();
    expect(await readStreamPart(reader, new AbortController().signal)).toEqual({ value: "Hello", done: false });
  });
});
