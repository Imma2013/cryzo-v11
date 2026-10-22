import { describe, expect, it } from "vitest";
import { TerminalTranscript } from "../src/lib/workspace/terminal-transcript";
describe("conversation terminal transcript", () => {
  it("orders runtime and shell chunks without confusing repeated content with replay", () => {
    const transcript = new TerminalTranscript();
    const seen: number[] = [];
    transcript.subscribe(entry => seen.push(entry.sequence));
    transcript.append("Installing\n"); transcript.append("$ pwd\n"); transcript.append("same\n"); transcript.append("same\n");
    expect(seen).toEqual([1, 2, 3, 4]);
    expect(transcript.snapshot().text).toBe("Installing\n$ pwd\nsame\nsame\n");
  });
  it("bounds scrollback while retaining sequence cursors for reattachment", () => {
    const transcript = new TerminalTranscript(8);
    transcript.append("123456"); const cursor = transcript.snapshot().sequence;
    transcript.append("7890"); transcript.append("ab");
    const seen: string[] = []; const stop = transcript.subscribe(entry => seen.push(entry.data), cursor);
    expect(transcript.snapshot()).toEqual({ sequence: 3, text: "567890ab" });
    expect(seen).toEqual(["7890", "ab"]);
    stop(); transcript.append("cd"); expect(seen).toEqual(["7890", "ab"]);
  });
});
