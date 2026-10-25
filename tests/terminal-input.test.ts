import {describe, expect, it} from "vitest";
import {TerminalInputDecoder} from "../src/lib/workspace/terminal-input";
describe("terminal input protocol boundaries", () => {
  it("drops split cursor and device replies without deleting real shell characters", () => {
    const decoder = new TerminalInputDecoder();
    expect(decoder.feed("\x1b[24;")).toEqual([]);
    expect(decoder.feed("80R\x1b[?1;2cR && echo '$$'\r").join("")).toBe("R && echo '$$'\r");
  });
  it("handles coalesced arrows, split paste markers and CRLF without duplicate submits", () => {
    const decoder = new TerminalInputDecoder();
    expect(decoder.feed("\x1b[20")).toEqual([]);
    expect(decoder.feed("0~pwd\r").join("")).toBe("pwd\r");
    expect(decoder.feed("\nls\x1b[201~\x1b[D\x1b[A").join("")).toBe("ls\x1b[D\x1b[A");
  });
  it("keeps Unicode and normal keyboard controls while consuming OSC responses", () => {
    const decoder = new TerminalInputDecoder();
    expect(decoder.feed("\x1b]10;rgb:ffff/ffff/ffff\x1b")).toEqual([]);
    expect(decoder.feed("\\é😀\x7f\x03").join("")).toBe("é😀\x7f\x03");
  });
});
