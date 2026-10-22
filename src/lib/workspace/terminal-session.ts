import { getWorkspaceContainer, syncWorkspaceFiles } from "./streaming-runtime";
import type { SandboxProcess } from "./sandbox";
import { terminalTranscript } from "./terminal-transcript";
type Listener = (chunk: string) => void;
/** Processes and history belong to the conversation, not to a mounted terminal. */
export class ProjectTerminal {
  private process: SandboxProcess | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private starting: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private closed = false;
  private line = "";
  private history: string[] = [];
  private historyIndex = 0;
  private cursor = 0;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: () => void;
  private transcript;
  constructor(readonly conversationId: string) {
    this.transcript = terminalTranscript(conversationId);
    this.unsubscribe = this.transcript.subscribe(entry => {
      // Input redraws never enter history. An arriving log preserves the draft.
      if (this.line) this.render("\r\x1b[2K" + entry.data + (entry.data.endsWith("\n") ? "" : "\r\n") + this.inputLine());
      else this.render(entry.data);
    });
  }
  get output() { return this.transcript.snapshot().text; }
  get draft() { return this.line ? this.inputLine() : ""; }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private render(chunk: string) { for (const listener of this.listeners) listener(chunk); }
  private emit(chunk: string) { this.transcript.append(chunk); }
  private inputLine() { return "$ " + this.line + (this.cursor < this.line.length ? "\x1b[" + (this.line.length - this.cursor) + "D" : ""); }
  start(): Promise<void> {
    if (this.closed || this.process) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const runtime = await getWorkspaceContainer(this.conversationId);
      if (this.closed) return;
      const proc = await runtime.spawn("sh");
      if (this.closed) { proc.kill(); return; }
      this.process = proc; this.writer = proc.input.getWriter();
      void proc.output.pipeTo(new WritableStream<string>({ write: chunk => {
        if (this.process !== proc) return;
        this.emit(chunk);
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => { void syncWorkspaceFiles(this.conversationId).catch(() => {}); }, 700);
      }})).catch(() => {});
      void proc.exit.then(() => {
        if (this.process === proc) { this.process = null; this.writer?.releaseLock(); this.writer = null; }
      });
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  private redraw() { this.render("\r\x1b[2K" + this.inputLine()); }
  input(data: string) {
    if (this.closed) return;
    if (!this.writer) {
      void this.start().then(() => { if (this.writer) this.input(data); }).catch(error => this.emit(String(error) + "\r\n"));
      return;
    }
    if (data === "\x1b[A" || data === "\x1b[B") {
      this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (data === "\x1b[A" ? -1 : 1)));
      this.line = this.history[this.historyIndex] || ""; this.cursor = this.line.length; this.redraw(); return;
    }
    if (data === "\x1b[D" || data === "\x1b[C") {
      this.cursor = Math.max(0, Math.min(this.line.length, this.cursor + (data === "\x1b[D" ? -1 : 1))); this.redraw(); return;
    }
    // xterm bracketed paste markers are terminal protocol, not shell input.
    data = data.replace(/\x1b\[20[01]~/g, "");
    if (data.startsWith("\x1b")) return;
    for (const char of data.replace(/\r\n/g, "\n")) {
      if (char === "\r" || char === "\n") {
        const command = this.line; this.render("\r\x1b[2K"); this.line = ""; this.cursor = 0;
        if (command.trim()) { this.history.push(command); this.history = this.history.slice(-200); }
        this.historyIndex = this.history.length;
        this.emit("$ " + command + "\r\n");
        void this.writer.write(command + "\n").catch(error => this.emit(String(error) + "\r\n"));
      } else if (char === "\x03") {
        this.line = ""; this.cursor = 0; this.emit("^C\r\n");
        // This shell is separate from the managed Metro/dev-server process.
        this.stopProcess(); void this.start().catch(error => this.emit(String(error) + "\r\n")); return;
      } else if (char === "\x15") { this.line = ""; this.cursor = 0; this.redraw(); }
      else if (char === "\x7f" || char === "\b") {
        if (this.cursor) { this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor); this.cursor--; this.redraw(); }
      } else if (char >= " ") {
        this.line = this.line.slice(0, this.cursor) + char + this.line.slice(this.cursor); this.cursor++; this.redraw();
      }
    }
  }
  private stopProcess() {
    const proc = this.process; this.process = null;
    try { this.writer?.releaseLock(); } catch {}
    this.writer = null; proc?.kill();
  }
  dispose() {
    this.closed = true; this.unsubscribe();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    this.stopProcess(); this.listeners.clear();
  }
}
const sessions = new Map<string, ProjectTerminal>();
export function projectTerminal(conversationId: string) {
  let session = sessions.get(conversationId);
  if (!session) { session = new ProjectTerminal(conversationId); sessions.set(conversationId, session); }
  return session;
}
export function closeProjectTerminals(conversationId: string) {
  sessions.get(conversationId)?.dispose(); sessions.delete(conversationId);
}
