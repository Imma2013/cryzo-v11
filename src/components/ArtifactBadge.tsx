"use client";

import { Code2, Sparkles } from "lucide-react";

export function ArtifactBadge({ title }: { title: string }) {
  return (
    <div className="my-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm">
      <Code2 size={16} className="text-blue-400" />
      <span className="flex-1 text-zinc-200">{title}</span>
      <Sparkles size={14} className="text-yellow-400" />
    </div>
  );
}
