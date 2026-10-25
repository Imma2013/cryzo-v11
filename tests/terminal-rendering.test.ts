import {readFileSync, readdirSync} from "node:fs";
import {EventEmitter} from "node:events";
import {createRequire} from "node:module";
import {runInNewContext} from "node:vm";
import {Terminal} from "@xterm/headless";
import {describe, expect, it} from "vitest";
import {terminalQr} from "../src/lib/workspace/expo-phone-session";
import {TerminalInputDecoder} from "../src/lib/workspace/terminal-input";
const write = (term: Terminal, text: string) => new Promise<void>(resolve => term.write(text, resolve));
const screen = (term: Terminal) => Array.from({length: term.buffer.active.length}, (_, i) => term.buffer.active.getLine(i)?.translateToString(true) || "").join("\n");
describe("real terminal rendering without a browser", () => {
  it("consumes terminal cursor queries without leaking replies into the command", async () => {
    const term = new Terminal({cols: 100, rows: 35, allowProposedApi: true});
    const decoder = new TerminalInputDecoder(), input: string[] = [];
    term.onData(data => input.push(...decoder.feed(data)));
    try {
      await write(term, "\x1b[6n\x1b[c");
      expect(input).toEqual([]);
      await write(term, terminalQr("exps://session.preview.cryzo.me") + "\r\nMetro waiting on Expo Go\r\n");
      const rendered = screen(term);
      expect(rendered).toContain("Metro waiting on Expo Go");
      expect(rendered).not.toMatch(/RRRR|&&&&|\$\$/);
      const rows = rendered.split("\n").filter(row => /[▀▄█]/.test(row));
      expect(rows.length).toBeGreaterThan(10);
      expect(rows.every(row => row.length < 100)).toBe(true);
    } finally { term.dispose(); }
  });
  it("lets the pinned Vivari shell edit and echo commands exactly once", async () => {
    const assets = new URL("../node_modules/@vivari/core/dist/assets/", import.meta.url);
    const worker = readdirSync(assets).find(name => /^kernel-worker.*\.js$/.test(name))!;
    const source = readFileSync(new URL(worker, assets), "utf8");
    const start = source.indexOf("\tsh: `") + "\tsh: ".length;
    const end = source.indexOf("\n`\n};", start) + 2;
    expect(start).toBeGreaterThan(10); expect(end).toBeGreaterThan(start);
    const shell = runInNewContext(source.slice(start, end)) as string;
    const input = Object.assign(new EventEmitter(), {resume() {}, setRawMode() {}});
    const term = new Terminal({cols: 100, rows: 20, allowProposedApi: true, convertEol: true});
    const output: string[] = [];
    const stdout = {write(value: string) {output.push(value); term.write(value);}};
    try {
      runInNewContext(shell, {require: createRequire(import.meta.url), process: {
        argv: ["node", "/bin/sh"], env: {}, cwd: () => "/cryzo-project", stdin: input, stdout, stderr: stdout,
      }});
      input.emit("data", "pwx"); input.emit("data", "\x7fd\r");
      await new Promise(resolve => setTimeout(resolve, 20)); await write(term, "");
      expect(screen(term)).toContain("cryzo-project$ pwd\n/cryzo-project\ncryzo-project$");
      expect(output.join("").match(/\$\x1b\[0m /g)).toHaveLength(3); // startup, edit redraw, completed command
      expect(screen(term)).not.toContain("$ $ ");
    } finally { term.dispose(); }
  });
});
