import { describe, expect, it } from "vitest";
import { parseGenerationFrame } from "@/lib/server/stream-events";

describe("background generation checkpoint parser", () => {
  it("reads text-delta frames without saving credentials or protocol syntax", () => {
    expect(parseGenerationFrame('data: {"type":"text-delta","id":"x","delta":"hello "}')).toEqual({ delta: "hello " });
    expect(parseGenerationFrame('data: {"type":"text-delta","id":"x","delta":"world"}')).toEqual({ delta: "world" });
    expect(parseGenerationFrame('data: [DONE]')).toEqual({});
  });
  it("ignores other SSE messages and preserves model errors", () => {
    expect(parseGenerationFrame('data: {"type":"text-start","id":"x"}')).toEqual({});
    expect(parseGenerationFrame('data: {"type":"error","errorText":"quota exceeded"}')).toEqual({ error: "quota exceeded" });
    expect(parseGenerationFrame('invalid')).toEqual({});
  });
});
