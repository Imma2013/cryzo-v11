/// <reference types="vite/client" />
import { describe, it, expect, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { consumeGeneration } from "@/lib/server/generation-consumer";
const modules = import.meta.glob("../convex/**/*.ts");
const bytes = (events: unknown[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const event of events)
        c.enqueue(
          new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
        );
      c.close();
    },
  });
describe("durable build recovery", () => {
  it("deduplicates starts, rejects stale workers, persists completed files, and cleans credentials on cancellation", async () => {
    vi.stubEnv("CRYZO_INTERNAL_API_SECRET", "fixture-service");
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) =>
      ctx.db.insert("users", { name: "Owner" }),
    );
    const owner = t.withIdentity({ subject: userId });
    const conversationId = await owner.mutation(api.conversations.create, {
      userId,
    });
    const input = {
      conversationId,
      kind: "generation" as const,
      key: "prompt-1",
      ciphertext: "encrypted",
      iv: "iv",
      tag: "tag",
    };
    const task = await owner.mutation(api.durableTasks.enqueue, input);
    expect((await owner.mutation(api.durableTasks.enqueue, input)).id).toBe(
      task.id,
    );
    const service = { id: task.id, internalSecret: "fixture-service" };
    expect(
      await t.mutation(api.durableTasks.claim, {
        ...service,
        attempt: "worker",
      }),
    ).toBe(true);
    expect(
      await t.mutation(api.durableTasks.claim, {
        ...service,
        attempt: "duplicate",
      }),
    ).toBe(false);
    const checkpoint = {
      taskId: task.id,
      internalSecret: "fixture-service",
      attempt: "worker",
      sequence: 1,
      text: "building",
      finished: false,
      files: [
        {
          index: 0,
          path: "App.tsx",
          content: "export default function App(){}",
        },
      ],
    };
    expect(
      await t.mutation(api.generationJobs.workerCheckpoint, checkpoint),
    ).toBe(true);
    expect(
      await t.mutation(api.generationJobs.workerCheckpoint, {
        ...checkpoint,
        text: "stale",
      }),
    ).toBe(false);
    expect(
      await owner.query(api.artifacts.listByConversation, { conversationId }),
    ).toHaveLength(1);
    expect(
      await owner.query(api.durableTasks.status, { id: task.id }),
    ).not.toHaveProperty("ciphertext");
    await owner.mutation(api.durableTasks.cancel, { id: task.id });
    expect(await t.run((ctx) => ctx.db.get(task.id))).not.toHaveProperty(
      "ciphertext",
    );
    expect(
      await t.mutation(api.generationJobs.workerCheckpoint, {
        ...checkpoint,
        sequence: 2,
      }),
    ).toBe(false);
    vi.unstubAllEnvs();
  });
  it("adopts legacy message IDs and rejects stale ID-less overwrites",async()=>{
    const t=convexTest(schema,modules);const userId=await t.run(ctx=>ctx.db.insert("users",{}));const owner=t.withIdentity({subject:userId});const conversationId=await owner.mutation(api.conversations.create,{userId});
    await owner.mutation(api.messages.saveAll,{conversationId,messages:[{role:"user",content:"hello"}]});
    const old=await owner.query(api.messages.list,{conversationId});
    await owner.mutation(api.messages.saveAll,{conversationId,messages:[{clientMessageId:old[0]._id,role:"user",content:"hello"}]});
    await owner.mutation(api.messages.saveAll,{conversationId,messages:[{role:"user",content:"stale"}]});
    const rows=await owner.query(api.messages.list,{conversationId});expect(rows).toHaveLength(1);expect(rows[0].content).toBe("hello");expect(rows[0].clientMessageId).toBe(old[0]._id);
  });
  it("does not treat a truncated stream as a completed website", async () => {
    const checkpoints: any[] = [];
    const save = async (value: any) => {
      checkpoints.push(value);
      return true;
    };
    const text =
      '<cryzoArtifact id="app"><cryzoAction type="file" filePath="App.tsx">hello</cryzoAction>';
    await expect(
      consumeGeneration(
        bytes([{ type: "text-delta", delta: text }]),
        save,
        new AbortController().signal,
      ),
    ).rejects.toThrow("interrupted");
    expect(checkpoints.flatMap((c) => c.files)).toEqual([
      { index: 0, path: "App.tsx", content: "hello" },
    ]);
    expect(checkpoints.every((c) => !c.finished)).toBe(true);
    await consumeGeneration(
      bytes([
        { type: "text-delta", delta: text + "</cryzoArtifact>" },
        { type: "finish" },
      ]),
      save,
      new AbortController().signal,
    );
    expect(checkpoints.at(-1).finished).toBe(true);
  });
  it("consumes the actual AI SDK custom build stream and preserves tool schemas in JSON", async () => {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        writer.write({ type: "text-start", id: "x" });
        writer.write({ type: "text-delta", id: "x", delta: "Complete" });
        writer.write({ type: "text-end", id: "x" });
        writer.write({ type: "finish", finishReason: "stop" });
      },
    });
    const saves: any[] = [];
    await consumeGeneration(
      createUIMessageStreamResponse({ stream }).body!,
      async (value) => {
        saves.push(value);
        return true;
      },
      new AbortController().signal,
    );
    expect(saves.at(-1)).toMatchObject({ finished: true, text: "Complete" });
    const calls: any[] = [];
    await consumeGeneration(
      bytes([
        {
          type: "tool-input-available",
          toolCallId: "a",
          toolName: "crawl",
          input: { $schema: "kept" },
        },
        {
          type: "tool-output-available",
          toolCallId: "a",
          output: { $ref: "kept" },
        },
        { type: "text-delta", delta: "Done" },
        { type: "finish" },
      ]),
      async (value) => {
        calls.push(value);
        return true;
      },
      new AbortController().signal,
    );
    expect(JSON.parse(calls.at(-1).partsJson)[0]).toMatchObject({
      state: "output-available",
      output: { $ref: "kept" },
    });
  });
  it("expires abandoned encrypted contexts and rejects cancelled access", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert("users", {}));
    const owner = t.withIdentity({ subject: userId });
    const conversationId = await owner.mutation(api.conversations.create, {
      userId,
    });
    const task = await owner.mutation(api.durableTasks.enqueue, {
      conversationId,
      kind: "expo",
      key: "rev",
      ciphertext: "encrypted",
      iv: "iv",
      tag: "tag",
    });
    await t.mutation(internal.durableTasks.expire, { id: task.id });
    expect(await t.run((ctx) => ctx.db.get(task.id))).toMatchObject({
      status: "failed",
    });
    expect(await t.run((ctx) => ctx.db.get(task.id))).not.toHaveProperty(
      "ciphertext",
    );
  });
});
