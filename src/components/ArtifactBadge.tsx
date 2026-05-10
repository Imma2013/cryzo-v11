"use client";

import { Code2, ExternalLink } from "lucide-react";
import Link from "next/link";

export function ArtifactBadge({
  title,
  conversationId,
}: {
  title: string;
  conversationId: string;
}) {
  return (
    <Link
      href={`/workspace/${conversationId}`}
      className="my-2 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm transition-colors hover:border-zinc-600 hover:bg-zinc-800"
    >
      <Code2 size={16} className="text-blue-400" />
      <span className="flex-1 text-zinc-200">{title}</span>
      <ExternalLink size={14} className="text-zinc-500" />
    </Link>
  );
}
