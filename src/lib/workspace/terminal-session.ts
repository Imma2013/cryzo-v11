import { getWorkspaceContainer, syncWorkspaceFiles } from "./streaming-runtime";
import type { SandboxProcess } from "./sandbox";
type Listener = (chunk: string) => void;
/** A terminal view never owns a process. Closing a view only detaches its renderer. */
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
  output = "";
  constructor(readonly conversationId: string) {}
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(chunk: string) { this.output = (this.output + chunk).slice(-200_000); for (const listener of this.listeners) listener(chunk); }
  start(): Promise<void> {
    if (this.process) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const runtime = await getWorkspaceContainer(this.conversationId);
      if (this.closed) return;
      const proc = await runtime.spawn("sh");
      if (this.closed) { proc.kill(); return; }
      this.process = proc; this.writer = proc.input.getWriter();
      void proc.output.pipeTo(new WritableStream<string>({write: chunk => {
        if (this.process !== proc) return;
        this.emit(chunk);
        if (this.syncTimer) clearTimeout(this.syncTimer);
        this.syncTimer = setTimeout(() => { void syncWorkspaceFiles(this.conversationId).catch(() => {}); }, 700);
      }})).catch(() => {});
      void proc.exit.then(() => { if (this.process === proc) { this.process = null; this.writer?.releaseLock(); this.writer = null; } });
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  private redraw() { this.emit("\r\x1b[2K" + this.line + (this.cursor < this.line.length ? `\x1b[${this.line.length - this.cursor}D` : "")); }
  input(data: string) {
    if (!this.writer) return;
    if (data === "\x1b[A" || data === "\x1b[B") {
      this.historyIndex = Math.max(0, Math.min(this.history.length, this.historyIndex + (data === "\x1b[A" ? -1 : 1)));
      this.line = this.history[this.historyIndex] || ""; this.cursor = this.line.length; this.redraw(); return;
    }
    if (data === "\x1b[D" || data === "\x1b[C") { this.cursor = Math.max(0, Math.min(this.line.length, this.cursor + (data === "\x1b[D" ? -1 : 1))); this.redraw(); return; }
    if (data.startsWith("\x1b")) return;
    for (const char of data.replace(/\r\n/g, "\n")) {
      if (char === "\r" || char === "\n") {
        const command = this.line; this.emit("\r\x1b[2K"); this.line = ""; this.cursor = 0;
        if (command.trim()) this.history.push(command); this.historyIndex = this.history.length;
        void this.writer.write(command + "\n").catch(error => this.emit(String(error) + "\r\n"));
      } else if (char === "\x03") { this.line = ""; this.cursor = 0; this.emit("^C\r\n"); this.stopProcess(); void this.start(); }
      else if (char === "\x15") { this.line = ""; this.cursor = 0; this.redraw(); }
      else if (char === "\x7f" || char === "\b") { if (this.cursor) { this.line = this.line.slice(0,this.cursor-1) + this.line.slice(this.cursor); this.cursor--; this.redraw(); } }
      else if (char >= " ") { this.line = this.line.slice(0,this.cursor) + char + this.line.slice(this.cursor); this.cursor++; this.redraw(); }
    }
  }
  private stopProcess() { const proc = this.process; this.process = null; try { this.writer?.releaseLock(); } catch {} this.writer = null; proc?.kill(); }
  dispose() { this.closed = true; if (this.syncTimer) clearTimeout(this.syncTimer); this.stopProcess(); this.listeners.clear(); }
}
const sessions = new Map<string, ProjectTerminal>();
export function projectTerminal(conversationId: string, tab = "1") {
  const key = conversationId + ":" + tab;
  let session = sessions.get(key); if (!session) { session = new ProjectTerminal(conversationId); sessions.set(key,session); }
  return session;
}
export function closeProjectTerminals(conversationId: string) {
  for (const [key, session] of sessions) if (session.conversationId === conversationId) { session.dispose(); sessions.delete(key); }
}
