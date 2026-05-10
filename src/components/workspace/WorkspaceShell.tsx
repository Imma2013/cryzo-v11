"use client";

import { useWorkspace } from "@/hooks/use-workspace";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { LivePreview } from "./LivePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { Id } from "../../../convex/_generated/dataModel";
import { Loader2 } from "lucide-react";

export function WorkspaceShell({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const {
    files,
    previewUrl,
    terminalOutput,
    isBooting,
    selectedFile,
    setSelectedFile,
  } = useWorkspace(conversationId);

  const selectedContent = selectedFile ? files[selectedFile]?.content || "" : "";

  if (isBooting && Object.keys(files).length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <div className="flex items-center gap-3 text-zinc-400">
          <Loader2 size={20} className="animate-spin" />
          Booting workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[200px_1fr_1fr] grid-rows-[1fr_200px] bg-black">
      {/* File tree */}
      <div className="row-span-2 border-r border-zinc-800 overflow-hidden">
        <FileTree
          files={files}
          selectedFile={selectedFile}
          onSelect={setSelectedFile}
        />
      </div>

      {/* Code editor */}
      <div className="border-r border-zinc-800 overflow-hidden">
        {selectedFile ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">
              {selectedFile}
            </div>
            <div className="flex-1 overflow-hidden">
              <CodeEditor filePath={selectedFile} content={selectedContent} />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            Select a file
          </div>
        )}
      </div>

      {/* Live preview */}
      <div className="overflow-hidden">
        <LivePreview url={previewUrl} />
      </div>

      {/* Terminal */}
      <div className="col-span-2 border-t border-zinc-800 overflow-hidden">
        <WorkspaceTerminal output={terminalOutput} />
      </div>
    </div>
  );
}
