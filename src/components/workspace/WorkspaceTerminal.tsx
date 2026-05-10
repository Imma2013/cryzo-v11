"use client";

import { useEffect, useRef } from "react";

export function WorkspaceTerminal({ output }: { output: string }) {
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [output]);

  return (
    <div className="flex h-full flex-col bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-500">
        Terminal
      </div>
      <pre
        ref={preRef}
        className="flex-1 overflow-auto p-3 font-mono text-xs text-zinc-300"
      >
        {output || "Waiting..."}
      </pre>
    </div>
  );
}
