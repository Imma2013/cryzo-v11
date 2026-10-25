/** xterm emits protocol replies as well as keystrokes. Decode across event boundaries. */
export class TerminalInputDecoder {
  private control = "";
  private lastWasCR = false;
  feed(data: string): string[] {
    const tokens: string[] = [];
    for (const char of data) {
      if (this.control) {
        this.control += char;
        if (this.control.length === 2 && "[O]P^_".includes(char)) continue;
        const kind = this.control[1];
        if (kind === "[" && this.control.length > 2 && /[\x40-\x7e]/.test(char)) {
          if (/^\x1b\[[ABCDHF]$/.test(this.control) || /^\x1b\[(?:1|3|4|7|8)~$/.test(this.control)) tokens.push(this.control);
          // Cursor/device reports and bracketed-paste delimiters are never commands.
          this.control = "";
        } else if (kind === "O" && this.control.length === 3) {
          if (/[ABCDHF]/.test(char)) tokens.push("\x1b[" + char);
          this.control = "";
        } else if ("]P^_".includes(kind)) {
          if (char === "\x07" || this.control.endsWith("\x1b\\") || this.control.length > 4096) this.control = "";
        } else if (kind !== "[" || this.control.length > 4096) this.control = "";
        continue;
      }
      if (char === "\x1b") { this.control = char; continue; }
      if (char === "\n" && this.lastWasCR) { this.lastWasCR = false; continue; }
      this.lastWasCR = char === "\r";
      tokens.push(char);
    }
    return tokens;
  }
}
