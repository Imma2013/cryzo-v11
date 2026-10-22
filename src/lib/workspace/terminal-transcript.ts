export type TerminalEntry = { sequence: number; data: string };
export class TerminalTranscript {
  private entries: TerminalEntry[] = [];
  private sequence = 0;
  private size = 0;
  private listeners = new Set<(entry: TerminalEntry) => void>();
  constructor(private readonly limit = 200_000) {}
  append(data: string) {
    if (!data) return;
    const entry = { sequence: ++this.sequence, data };
    this.entries.push(entry);
    this.size += data.length;
    while (this.size > this.limit && this.entries.length) {
      const first = this.entries[0], excess = this.size - this.limit;
      if (first.data.length <= excess) { this.entries.shift(); this.size -= first.data.length; }
      else { this.entries[0] = { ...first, data: first.data.slice(excess) }; this.size -= excess; }
    }
    for (const listener of this.listeners) listener(entry);
  }
  snapshot() { return { sequence: this.sequence, text: this.entries.map(entry => entry.data).join("") }; }
  subscribe(listener: (entry: TerminalEntry) => void, after = this.sequence) {
    this.listeners.add(listener);
    for (const entry of this.entries) if (entry.sequence > after) listener(entry);
    return () => { this.listeners.delete(listener); };
  }
}
const transcripts = new Map<string, TerminalTranscript>();
export function terminalTranscript(conversationId: string) {
  let transcript = transcripts.get(conversationId);
  if (!transcript) { transcript = new TerminalTranscript(); transcripts.set(conversationId, transcript); }
  return transcript;
}
