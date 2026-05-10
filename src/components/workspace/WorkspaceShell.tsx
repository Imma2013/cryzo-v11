"use client";

import { useWorkspace } from "@/hooks/use-workspace";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { LivePreview } from "./LivePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { Id } from "../../../convex/_generated/dataModel";
import { Loader2, AlertCircle } from "lucide-react";

const PROGRESS_LABELS = {
  writing: "Writing files...",
  installing: "Installing dependencies...",
  starting: "Starting dev server...",
  ready: "Ready",
  error: "Error",
};

export function WorkspaceShell({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const {
    files,
    previewUrl,
    terminalOutput,
    progress,
    error,
    isBooting,
    selectedFile,
    setSelectedFile,
  } = useWorkspace(conversationId);

  const selectedContent = selectedFile ? files[selectedFile]?.content || "" : "";

  return (
    <div className="flex h-full flex-col">
      {/* Progress/Error bar */}
      {(isBooting || error) && (
        <div
          className={`flex items-center gap-2 px-4 py-2 text-xs ${
            error
              ? "bg-red-900/30 text-red-400"
              : "bg-zinc-800 text-zinc-400"
          }`}
        >
          {error ? (
            <>
              <AlertCircle size={14} />
              {error}
            </>
          ) : (
            <>
              <Loader2 size={14} className="animate-spin" />
              {PROGRESS_LABELS[progress]}
            </>
          )}
        </div>
      )}

      {/* Main workspace grid */}
      <div className="flex-1 grid grid-cols-[200px_1fr_1fr] grid-rows-[1fr_180px] overflow-hidden">
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
              Select a file to view
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="overflow-hidden">
          <LivePreview url={previewUrl} isBooting={isBooting} progress={progress} />
        </div>

        {/* Terminal */}
        <div className="col-span-2 border-t border-zinc-800 overflow-hidden">
          <WorkspaceTerminal output={terminalOutput} />
        </div>
      </div>
    </div>
  );
}
