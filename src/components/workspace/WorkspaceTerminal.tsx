"use client";

import { useEffect, useRef } from "react";
import { projectTerminal } from "@/lib/workspace/terminal-session";

export function WorkspaceTerminal({ conversationId }: { conversationId: string }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"), import("@xterm/addon-fit"),
      ]);
      if (disposed || !container.current) return;
      const terminal = new Terminal({
        cursorBlink: true, convertEol: true, disableStdin: false,
        fontSize: 12, fontFamily: "Menlo, Monaco, Consolas, monospace",
        scrollback: 5000, rightClickSelectsWord: true,
        theme: { background: "#09090b", foreground: "#d4d4d8", cursor: "#e4e4e7", selectionBackground: "#3f3f46" },
      });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(container.current);
      const links = terminal.registerLinkProvider({provideLinks(line, callback) {
        const text = terminal.buffer.active.getLine(line - 1)?.translateToString(true) || "";
        callback(Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/g), match => ({
          range: {start: {x: match.index! + 1, y: line}, end: {x: match.index! + match[0].length, y: line}},
          text: match[0],
          activate: () => { window.open(match[0], "_blank", "noopener,noreferrer"); },
        })));
      }});
      const resize = () => {
        if (disposed || !container.current?.clientWidth || !container.current?.clientHeight) return;
        try {
          fit.fit();
          // Keep the QR's square modules and quiet zone intact in narrow panels.
          // The pane can scroll horizontally; Device Preview keeps the full-size QR.
          if (terminal.cols < 48) terminal.resize(48, terminal.rows);
        } catch { /* The panel may be transitioning to hidden. */ }
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container.current); resize();
      const session = projectTerminal(conversationId);
      // Replay once, then attach to incremental events in the same synchronous turn.
      terminal.write(session.output); terminal.write(session.draft);
      const unsubscribe = session.subscribe(chunk => terminal.write(chunk));
      const input = terminal.onData(data => session.input(data));
      cleanup = () => { observer.disconnect(); unsubscribe(); input.dispose(); links.dispose(); terminal.dispose(); };
      await session.start();
      if (!disposed) terminal.focus();
    })().catch(error => {
      if (!disposed) console.error("Project terminal could not start", error);
    });
    return () => { disposed = true; cleanup(); };
  }, [conversationId]);
  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950" aria-label="Project terminal">
      <div className="flex h-8 shrink-0 items-center border-b border-zinc-800 px-3 text-xs font-medium text-zinc-300">
        Terminal
      </div>
      <div ref={container} className="cryzo-terminal min-h-0 flex-1 overflow-auto p-3" />
    </section>
  );
}
