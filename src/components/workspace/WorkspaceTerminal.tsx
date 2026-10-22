"use client";

import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { projectTerminal } from "@/lib/workspace/terminal-session";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = "terminal" | "output";

function createTerminal(readonly = false) {
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue("--cryzo-panel").trim() || "#09090b";
  const foreground = style.getPropertyValue("--cryzo-text").trim() || "#e4e4e7";
  const muted = style.getPropertyValue("--cryzo-muted").trim() || "#71717a";
  const accent = style.getPropertyValue("--cryzo-accent").trim() || "#60a5fa";

  return new XTerm({
    cursorBlink: !readonly,
    convertEol: true,
    disableStdin: readonly,
    fontFamily:
      "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.25,
    scrollback: 3000,
    rightClickSelectsWord: true,
    theme: {
      background,
      foreground,
      cursor: readonly ? "transparent" : foreground,
      cursorAccent: background,
      selectionBackground: `${accent}55`,
      black: background,
      brightBlack: muted,
      red: "#f87171",
      brightRed: "#fca5a5",
      green: "#4ade80",
      brightGreen: "#86efac",
      yellow: "#facc15",
      brightYellow: "#fde047",
      blue: accent,
      brightBlue: "#93c5fd",
      magenta: "#c084fc",
      brightMagenta: "#d8b4fe",
      cyan: "#22d3ee",
      brightCyan: "#67e8f9",
      white: foreground,
      brightWhite: "#ffffff",
    },
  });
}

export function WorkspaceTerminal({ output, conversationId }: { output: string; conversationId: string }) {
  const [tab, setTab] = useState<TerminalTab>("terminal");
  const shellHostRef = useRef<HTMLDivElement>(null);
  const outputHostRef = useRef<HTMLDivElement>(null);
  const shellTerminalRef = useRef<XTerm | null>(null);
  const outputTerminalRef = useRef<XTerm | null>(null);
  const shellFitRef = useRef<FitAddon | null>(null);
  const outputFitRef = useRef<FitAddon | null>(null);
  const [shellTab, setShellTab] = useState("1");
  const lastOutputRef = useRef("");

  useEffect(() => {
    const shellHost = shellHostRef.current;
    const outputHost = outputHostRef.current;
    if (!shellHost || !outputHost) return;

    const shellTerminal = createTerminal(false);
    const outputTerminal = createTerminal(true);
    const shellFit = new FitAddon();
    const outputFit = new FitAddon();

    shellTerminal.loadAddon(shellFit);
    outputTerminal.loadAddon(outputFit);
    shellTerminal.open(shellHost);
    outputTerminal.open(outputHost);

    shellTerminalRef.current = shellTerminal;
    outputTerminalRef.current = outputTerminal;
    shellFitRef.current = shellFit;
    outputFitRef.current = outputFit;

    lastOutputRef.current = output;
    if (output) outputTerminal.write(output);
    else outputTerminal.writeln("Waiting for runtime output…");

    let disposed = false;
    const session = projectTerminal(conversationId, shellTab);
    shellTerminal.write(session.output);
    const detachSession = session.subscribe(chunk => shellTerminal.write(chunk));
    const fit = () => {
      try {
        shellFit.fit();
        outputFit.fit();
      } catch {
        // The panel can briefly have zero width while resizable panels settle.
      }
    };

    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(shellHost);
    resizeObserver.observe(outputHost);
    requestAnimationFrame(fit);

    const dataDisposable = shellTerminal.onData(data => session.input(data));
    void (async () => {
      try {
        await session.start();
        fit();
        shellTerminal.focus();
      } catch (error) {
        if (!disposed) {
          shellTerminal.writeln("");
          shellTerminal.writeln(
            `\x1b[31mUnable to start interactive shell: ${
              error instanceof Error ? error.message : String(error)
            }\x1b[0m`,
          );
        }
      }
    })();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      detachSession();
      shellTerminal.dispose();
      outputTerminal.dispose();
      shellTerminalRef.current = null;
      outputTerminalRef.current = null;
      shellFitRef.current = null;
      outputFitRef.current = null;
    };
    // The terminals and shell process are intentionally created once per panel mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, shellTab]);

  useEffect(() => {
    const terminal = outputTerminalRef.current;
    if (!terminal) return;

    const previous = lastOutputRef.current;
    if (output === previous) return;

    if (output.startsWith(previous)) {
      terminal.write(output.slice(previous.length));
    } else {
      terminal.clear();
      terminal.write(output || "Waiting for runtime output…\r\n");
    }
    lastOutputRef.current = output;
  }, [output]);

  useEffect(() => {
    requestAnimationFrame(() => {
      try {
        if (tab === "terminal") {
          shellFitRef.current?.fit();
          shellTerminalRef.current?.focus();
        } else {
          outputFitRef.current?.fit();
        }
      } catch {}
    });
  }, [tab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--cryzo-panel)] text-[var(--cryzo-text)]">
      <div className="flex h-9 shrink-0 items-center border-b border-[var(--cryzo-border)] px-2">
        <div className="flex items-center gap-1 rounded-md bg-black/20 p-0.5">
          <button
            type="button"
            onClick={() => setTab("terminal")}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === "terminal"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            Terminal
          </button>
          <button
            type="button"
            onClick={() => setTab("output")}
            className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
              tab === "output"
                ? "bg-zinc-700 text-white"
                : "text-zinc-500 hover:text-zinc-200"
            }`}
          >
            Output
          </button>
        </div>
        {tab === "terminal" && <div className="ml-2 flex gap-1">{["1", "2"].map(id => <button type="button" aria-label={"Terminal " + id} aria-pressed={shellTab === id} key={id} onClick={() => setShellTab(id)} className={"rounded px-2 py-1 text-[11px] " + (shellTab === id ? "bg-zinc-700 text-white" : "text-zinc-500")}>{id}</button>)}</div>}
        <span className="ml-auto pr-1 text-[10px] text-zinc-600">
          {tab === "terminal" ? "Project shell" : "Runtime logs"}
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-[var(--cryzo-panel)]">
        <div
          ref={shellHostRef}
          className={`absolute inset-0 p-2 ${
            tab === "terminal" ? "visible" : "invisible pointer-events-none"
          }`}
        />
        <div
          ref={outputHostRef}
          className={`absolute inset-0 p-2 ${
            tab === "output" ? "visible" : "invisible pointer-events-none"
          }`}
        />
      </div>
    </div>
  );
}
