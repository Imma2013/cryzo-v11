"use client";

import { useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Code2, Eye, Loader2, AlertCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { LivePreview } from "./LivePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { Id } from "../../../convex/_generated/dataModel";

type ViewMode = "preview" | "code";

export function WorkspacePanel({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");

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
    <div className="flex h-full flex-col bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        <div className="flex rounded-md bg-zinc-900 p-0.5">
          <button
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "preview"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Eye size={12} />
            Preview
          </button>
          <button
            onClick={() => setViewMode("code")}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "code"
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            <Code2 size={12} />
            Code
          </button>
        </div>

        {/* Status indicator */}
        <div className="ml-auto flex items-center gap-2 text-xs">
          {error ? (
            <span className="flex items-center gap-1 text-red-400">
              <AlertCircle size={12} />
              Error
            </span>
          ) : isBooting ? (
            <span className="flex items-center gap-1 text-zinc-400">
              <Loader2 size={12} className="animate-spin" />
              {progress === "writing" && "Writing files..."}
              {progress === "installing" && "Installing..."}
              {progress === "starting" && "Starting server..."}
            </span>
          ) : progress === "ready" ? (
            <span className="text-green-400">Ready</span>
          ) : null}
        </div>
      </div>

      {/* Main content area */}
      <Group orientation="vertical" className="flex-1">
        <Panel defaultSize={70} minSize={30}>
          {viewMode === "preview" ? (
            <LivePreview url={previewUrl} isBooting={isBooting} progress={progress} />
          ) : (
            <div className="flex h-full">
              {/* File tree */}
              <div className="w-48 border-r border-zinc-800 overflow-hidden">
                <FileTree
                  files={files}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              </div>
              {/* Editor */}
              <div className="flex-1 overflow-hidden">
                {selectedFile ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-zinc-800 px-3 py-1 text-xs text-zinc-500">
                      {selectedFile}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <CodeEditor filePath={selectedFile} content={selectedContent} />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Select a file
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Separator className="h-1 bg-zinc-800 hover:bg-zinc-700 cursor-row-resize" />

        {/* Terminal */}
        <Panel defaultSize={30} minSize={10} collapsible>
          <WorkspaceTerminal output={terminalOutput} />
        </Panel>
      </Group>
    </div>
  );
}
