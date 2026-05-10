"use client";

export function ToolCallDisplay({
  state,
  hideWhenComplete = false,
}: {
  state: "call" | "result" | "partial-call";
  hideWhenComplete?: boolean;
}) {
  const isComplete = state === "result";

  if (isComplete && hideWhenComplete) return null;

  return (
    <div className="my-2 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-xs text-zinc-400">
      {isComplete ? (
        <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
      ) : (
        <span className="inline-block h-3 w-3 animate-spin rounded-full border border-zinc-700 border-t-zinc-300" />
      )}
      <span>{isComplete ? "Working..." : "Thinking..."}</span>
    </div>
  );
}
