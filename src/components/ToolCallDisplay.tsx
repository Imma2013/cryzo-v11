"use client";

import { useState } from "react";

export function ToolCallDisplay({
  toolName,
  args,
  result,
  state,
}: {
  toolName: string;
  args: unknown;
  result?: unknown;
  state: "call" | "result" | "partial-call";
}) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = state !== "result";

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors ${
          isLoading
            ? "border-zinc-700 bg-zinc-800 text-zinc-400"
            : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        }`}
      >
        {isLoading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-600 border-t-zinc-300" />
        ) : (
          <span className="text-green-400">&#10003;</span>
        )}
        <code className="font-mono">{toolName}</code>
        {!isLoading && (
          <span className="text-zinc-500">{expanded ? "▴" : "▾"}</span>
        )}
      </button>

      {expanded && !isLoading && (
        <pre className="mt-1 ml-1 max-h-40 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-md border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-400">
          {result != null
            ? JSON.stringify(result, null, 2)
            : JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}
