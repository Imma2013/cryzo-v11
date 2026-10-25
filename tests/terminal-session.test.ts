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

describe("one editable Vivari shell with shared output", () => {
 it("forwards raw editing to Vivari without adding a second prompt or echo", async () => {
  const {session,writes,output}=fixture();await session.start();
  const render:string[]=[];session.subscribe(chunk=>render.push(chunk));
  session.input("pwx");session.input("\x7f");session.input("d\r");
  await vi.advanceTimersByTimeAsync(0);
  expect(writes.join("")).toBe("pwx\x7fd\r");expect(session.output).toBe("");
  output.enqueue("cryzo-project$ pwd\n/cryzo-project\ncryzo-project$ ");await vi.advanceTimersByTimeAsync(0);
  expect(session.output).toBe("cryzo-project$ pwd\n/cryzo-project\ncryzo-project$ ");expect(session.draft).toBe("");
  expect(render.join("")).toBe(session.output);
 });
 it("filters split device replies while retaining paste, history, arrows and shell operators", async () => {
  const {session,writes}=fixture();await session.start();
  session.input("\x1b[20");session.input("0~echo 'R && $$'\r\nls\x1b[201~");
  session.input("\x1b[A\x1b[D");session.input("\x1b[12;");session.input("40R\x1b[?1;2c");
  await vi.advanceTimersByTimeAsync(0);
  expect(writes.join("")).toBe("echo 'R && $$'\rls\x1b[A\x1b[D");
 });
 it("keeps the shell running when a renderer detaches and syncs command file changes", async () => {
  const {session,output,process}=fixture();await session.start();
  const detach=session.subscribe(()=>{});detach();
  output.enqueue("wrote file\n");await vi.advanceTimersByTimeAsync(800);
  expect(process.kill).not.toHaveBeenCalled();expect(runtime.sync).toHaveBeenCalledWith(session.conversationId);
  terminalTranscript(session.conversationId).append("Metro ready\n");
  expect(session.output).toContain("wrote file\nMetro ready\n");
 });
 it("passes Ctrl+C to the foreground job instead of destroying the persistent shell", async () => {
  const {session,process,writes}=fixture();await session.start();session.input("\x03");await vi.advanceTimersByTimeAsync(0);
  expect(writes).toEqual(["\x03"]);expect(process.kill).not.toHaveBeenCalled();
 });
 it("queues early input once while the shell is starting", async () => {
  const {session,writes,spawn}=fixture();session.input("pw");session.input("d\r");await vi.advanceTimersByTimeAsync(0);
  expect(spawn).toHaveBeenCalledTimes(1);expect(writes.join("")).toBe("pwd\r");
 });
});
