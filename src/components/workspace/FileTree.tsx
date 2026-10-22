"use client";
import { useMemo, useState } from "react";
import { ChevronRight, File, Folder, FolderOpen, Search } from "lucide-react";
import type { FileMap } from "@/lib/workspace/types";
import { buildFileTree, type TreeNode } from "@/lib/workspace/file-tree";
export function FileTree({ files, selectedFile, onSelect }: { files: FileMap; selectedFile: string | null; onSelect: (path: string) => void }) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = useMemo(() => buildFileTree(files, query), [files, query]);
  function render(node: TreeNode, depth: number) {
    const open = !!query || !collapsed.has(node.path);
    return <div key={node.path}>
      <button type="button" aria-expanded={node.directory ? open : undefined} aria-current={!node.directory && selectedFile === node.path ? "true" : undefined}
        title={node.path} onClick={() => node.directory ? setCollapsed(previous => { const next = new Set(previous); if (next.has(node.path)) next.delete(node.path); else next.add(node.path); return next; }) : onSelect(node.path)}
        className={"flex w-full items-center gap-1.5 rounded py-1 text-left text-xs transition-colors " + (selectedFile === node.path ? "bg-zinc-700 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white")}
        style={{paddingLeft: depth * 12 + 8}}>
        {node.directory ? <><ChevronRight size={11} className={open ? "rotate-90" : ""}/>{open ? <FolderOpen size={12}/> : <Folder size={12}/>}</> : <File size={12} className="ml-4 shrink-0"/>}
        <span className="truncate">{node.name}</span>
      </button>
      {node.directory && open && node.children.map(child => render(child, depth + 1))}
    </div>;
  }
  return <div className="flex h-full flex-col bg-zinc-900 p-2">
    <div className="mb-2 px-2 text-xs font-semibold uppercase text-zinc-500">Files</div>
    <label className="mb-2 flex items-center gap-1 rounded border border-zinc-800 px-2 text-zinc-500"><Search size={12}/><input aria-label="Search project files" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search files" className="min-w-0 flex-1 bg-transparent py-1.5 text-xs text-zinc-200 outline-none"/></label>
    <div className="min-h-0 flex-1 overflow-auto">{tree.length ? tree.map(node => render(node, 0)) : <p className="p-2 text-xs text-zinc-500">{query ? "No matching files" : "Project files will appear here"}</p>}</div>
  </div>;
}
