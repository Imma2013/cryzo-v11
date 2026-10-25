import { getWorkspaceContainer, syncWorkspaceFiles } from "./streaming-runtime";
import type { SandboxProcess } from "./sandbox";
import { terminalTranscript } from "./terminal-transcript";
import { TerminalInputDecoder } from "./terminal-input";
type Listener = (chunk: string) => void;

/** Vivari owns editing, echo, history and foreground jobs. xterm is only the renderer. */
export class ProjectTerminal {
  private process: SandboxProcess | null = null;
  private writer: WritableStreamDefaultWriter<string> | null = null;
  private starting: Promise<void> | null = null;
  private listeners = new Set<Listener>();
  private closed = false;
  private decoder = new TerminalInputDecoder();
  private inputQueue: Promise<void> = Promise.resolve();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: () => void;
  private transcript;
  constructor(readonly conversationId: string) {
    this.transcript = terminalTranscript(conversationId);
    this.unsubscribe = this.transcript.subscribe(entry => {
      for (const listener of this.listeners) listener(entry.data);
    });
  }
  get output() { return this.transcript.snapshot().text; }
  // The shell's echoed draft is already in its transcript; never echo it twice.
  get draft() { return ""; }
  subscribe(listener: Listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(chunk: string) { this.transcript.append(chunk); }
  start(): Promise<void> {
    if (this.closed || this.process) return Promise.resolve();
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
      }})).catch(error => { if (!this.closed) this.emit(String(error) + "\r\n"); });
      void proc.exit.then(() => {
        if (this.process === proc) { this.process = null; this.writer?.releaseLock(); this.writer = null; }
      });
    })().finally(() => { this.starting = null; });
    return this.starting;
  }
  input(data: string) {
    if (this.closed) return;
    const decoded = this.decoder.feed(data).join("");
    if (!decoded) return;
    // Keep input ordered while starting and when the process applies backpressure.
    this.inputQueue = this.inputQueue.then(async () => {
      await this.start();
      if (!this.closed) await this.writer?.write(decoded);
    }).catch(error => { if (!this.closed) this.emit(String(error) + "\r\n"); });
  }
  dispose() {
    this.closed = true; this.unsubscribe();
    if (this.syncTimer) clearTimeout(this.syncTimer);
    const proc = this.process; this.process = null;
    try { this.writer?.releaseLock(); } catch { /* Pending input is being cancelled. */ }
    this.writer = null; proc?.kill(); this.listeners.clear();
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
