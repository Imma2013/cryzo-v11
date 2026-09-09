"use client";

import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { getWebContainer } from "@/lib/workspace/webcontainer";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = "terminal" | "output";

type ShellProcess = {
  kill: () => void;
  resize: (dimensions: { cols: number; rows: number }) => void;
  input: WritableStream<string>;
  output: ReadableStream<string>;
};

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

export function WorkspaceTerminal({ output }: { output: string }) {
  const [tab, setTab] = useState<TerminalTab>("terminal");
  const shellHostRef = useRef<HTMLDivElement>(null);
  const outputHostRef = useRef<HTMLDivElement>(null);
  const shellTerminalRef = useRef<XTerm | null>(null);
  const outputTerminalRef = useRef<XTerm | null>(null);
  const shellFitRef = useRef<FitAddon | null>(null);
  const outputFitRef = useRef<FitAddon | null>(null);
  const shellProcessRef = useRef<ShellProcess | null>(null);
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
    let inputWriter: WritableStreamDefaultWriter<string> | null = null;

    const fit = () => {
      try {
        shellFit.fit();
        outputFit.fit();
        const process = shellProcessRef.current;
        if (process && shellTerminal.cols > 0 && shellTerminal.rows > 0) {
          process.resize({ cols: shellTerminal.cols, rows: shellTerminal.rows });
        }
      } catch {
        // The panel can briefly have zero width while resizable panels settle.
      }
    };

    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(shellHost);
    resizeObserver.observe(outputHost);
    requestAnimationFrame(fit);

    const dataDisposable = shellTerminal.onData((data) => {
      if (!inputWriter) return;
      void inputWriter.write(data).catch(() => {});
    });

    void (async () => {
      try {
        const webcontainer = await getWebContainer();
        if (disposed) return;

        const process = (await webcontainer.spawn("/bin/jsh", ["--osc"], {
          terminal: {
            cols: shellTerminal.cols || 80,
            rows: shellTerminal.rows || 15,
          },
        })) as unknown as ShellProcess;

        if (disposed) {
          process.kill();
          return;
        }

        shellProcessRef.current = process;
        inputWriter = process.input.getWriter();

        void process.output
          .pipeTo(
            new WritableStream({
              write(data) {
                if (!disposed) shellTerminal.write(data);
              },
            }),
          )
          .catch(() => {});

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
      try {
        inputWriter?.releaseLock();
      } catch {}
      try {
        shellProcessRef.current?.kill();
      } catch {}
      shellProcessRef.current = null;
      shellTerminal.dispose();
      outputTerminal.dispose();
      shellTerminalRef.current = null;
      outputTerminalRef.current = null;
      shellFitRef.current = null;
      outputFitRef.current = null;
    };
    // The terminals and shell process are intentionally created once per panel mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <span className="ml-auto pr-1 text-[10px] text-zinc-600">
          {tab === "terminal" ? "WebContainer shell" : "Runtime logs"}
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
