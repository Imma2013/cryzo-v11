import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const runtime = vi.hoisted(() => ({ container: vi.fn(), sync: vi.fn(async () => {}) }));
vi.mock("../src/lib/workspace/streaming-runtime", () => ({ getWorkspaceContainer: runtime.container, syncWorkspaceFiles: runtime.sync }));
import { ProjectTerminal } from "../src/lib/workspace/terminal-session";
import { terminalTranscript } from "../src/lib/workspace/terminal-transcript";
let sessions: ProjectTerminal[] = [];
let serial = 0;
beforeEach(() => { vi.useFakeTimers(); runtime.container.mockReset(); runtime.sync.mockClear(); });
afterEach(() => { for (const session of sessions) session.dispose(); sessions = []; vi.useRealTimers(); });
function fixture() {
  const writes: string[] = [];
  let output!: ReadableStreamDefaultController<string>;
  let exit!: (code: number) => void;
  const process = {
    input: new WritableStream<string>({ write: value => { writes.push(value); } }),
    output: new ReadableStream<string>({ start: controller => { output = controller; } }),
    exit: new Promise<number>(resolve => { exit = resolve; }),
    kill: vi.fn(() => exit(0)),
  };
  const spawn = vi.fn(async () => process);
  runtime.container.mockResolvedValue({ spawn });
  const session = new ProjectTerminal("terminal-test-" + ++serial); sessions.push(session);
  return { session, process, writes, output, spawn };
}
describe("editable terminal with shared runtime output", () => {
  it("keeps an edited draft while logs arrive and sends only the finished command", async () => {
    const { session, writes } = fixture(); await session.start();
    const render: string[] = []; const detach = session.subscribe(chunk => render.push(chunk));
    session.input("pwx"); session.input("\x7f"); session.input("d");
    terminalTranscript(session.conversationId).append("Metro ready\n");
    expect(render.at(-1)).toContain("$ pwd");
    expect(session.output).toBe("Metro ready\n");
    session.input("\r"); await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["pwd\n"]);
    expect(session.output).toBe("Metro ready\n$ pwd\r\n");
    detach();
    expect(session.output).toContain("Metro ready");
  });
  it("supports multiline paste, history and cursor editing without persisting redraws", async () => {
    const { session, writes } = fixture(); await session.start();
    session.input("\x1b[200~pwd\r\nls\x1b[201~"); session.input("\r");
    session.input("\x1b[A"); session.input("\x1b[D"); session.input("a"); session.input("\r");
    await vi.advanceTimersByTimeAsync(0);
    expect(writes).toEqual(["pwd\n", "ls\n", "las\n"]);
    expect(session.output).not.toContain("\x1b[2K");
  });
  it("leaves the shell running when its renderer detaches and syncs command file changes", async () => {
    const { session, output, process } = fixture(); await session.start();
    const detach = session.subscribe(() => {}); detach();
    output.enqueue("wrote file\n"); await vi.advanceTimersByTimeAsync(800);
    expect(process.kill).not.toHaveBeenCalled();
    expect(runtime.sync).toHaveBeenCalledWith(session.conversationId);
    expect(session.output).toContain("wrote file");
  });
  it("cancels only its own interactive shell", async () => {
    const { session, process } = fixture(); await session.start();
    session.input("\x03"); expect(process.kill).toHaveBeenCalledTimes(1);
    expect(session.output).toContain("^C");
  });
});
