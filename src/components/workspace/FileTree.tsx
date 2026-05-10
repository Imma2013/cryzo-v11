"use client";

import { File, Folder } from "lucide-react";
import type { FileMap } from "@/lib/workspace/types";

export function FileTree({
  files,
  selectedFile,
  onSelect,
}: {
  files: FileMap;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}) {
  const entries = Object.entries(files).sort(([a, av], [b, bv]) => {
    if (av.type !== bv.type) return av.type === "folder" ? -1 : 1;
    return a.localeCompare(b);
  });

  const topLevel = entries.filter(([path]) => !path.includes("/"));
  const nested = new Map<string, string[]>();

  for (const [path] of entries) {
    const parts = path.split("/");
    if (parts.length > 1) {
      const parent = parts.slice(0, -1).join("/");
      if (!nested.has(parent)) nested.set(parent, []);
      nested.get(parent)!.push(path);
    }
  }

  function renderEntry(path: string, depth: number) {
    const entry = files[path];
    if (!entry) return null;
    const name = path.split("/").pop()!;
    const children = nested.get(path) || [];

    return (
      <div key={path}>
        <button
          onClick={() => entry.type === "file" && onSelect(path)}
          className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
            selectedFile === path
              ? "bg-zinc-700 text-white"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {entry.type === "folder" ? (
            <Folder size={12} />
          ) : (
            <File size={12} />
          )}
          {name}
        </button>
        {children.map((child) => renderEntry(child, depth + 1))}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-900 p-2">
      <div className="mb-2 px-2 text-xs font-semibold uppercase text-zinc-500">
        Files
      </div>
      {topLevel.map(([path]) => renderEntry(path, 0))}
    </div>
  );
}
