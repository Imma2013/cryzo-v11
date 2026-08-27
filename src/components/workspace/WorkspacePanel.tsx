"use client";

import { useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { Code2, Eye, Loader2, AlertCircle } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { LivePreview, type ElementInfo } from "./LivePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { PublishControls } from "./PublishControls";
import { Id } from "../../../convex/_generated/dataModel";

type ViewMode = "preview" | "code";

export function WorkspacePanel({
  conversationId,
  onElementSelected,
  mobile = false,
}: {
  conversationId: Id<"conversations">;
  onElementSelected?: (info: ElementInfo) => void;
  mobile?: boolean;
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
    <div
      className={`flex h-full flex-col overflow-hidden ${
        mobile
          ? "rounded-2xl border border-zinc-200 bg-white shadow-sm"
          : "rounded-lg border border-zinc-800 bg-zinc-950"
      }`}
    >
      <div
        className={`flex items-center gap-1 border-b px-3 py-2 ${
          mobile ? "border-zinc-200 bg-white" : "border-zinc-800"
        }`}
      >
        <div className={`flex rounded-md p-0.5 ${mobile ? "bg-zinc-100" : "bg-zinc-900"}`}>
          <button
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors ${
              viewMode === "preview"
                ? mobile
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "bg-zinc-700 text-white"
                : mobile
                  ? "text-zinc-500 hover:text-zinc-950"
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
                ? mobile
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "bg-zinc-700 text-white"
                : mobile
                  ? "text-zinc-500 hover:text-zinc-950"
                  : "text-zinc-400 hover:text-white"
            }`}
          >
            <Code2 size={12} />
            Code
          </button>
        </div>

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {!mobile && (
            <PublishControls
              files={files}
              conversationId={conversationId}
              disabled={isBooting || !!error}
            />
          )}

          <div className="flex items-center gap-2 text-xs">
            {error ? (
              <span className="flex items-center gap-1 text-red-500">
                <AlertCircle size={12} />
                Error
              </span>
            ) : isBooting ? (
              <span className={mobile ? "text-zinc-500" : "text-zinc-400"}>
                <Loader2 size={12} className="mr-1 inline animate-spin" />
                {progress === "writing" && "Writing..."}
                {progress === "installing" && "Installing..."}
                {progress === "starting" && "Starting..."}
              </span>
            ) : progress === "ready" ? (
              <span className="text-emerald-500">Ready</span>
            ) : null}
          </div>
        </div>
      </div>

      {viewMode === "preview" ? (
        <div className="flex-1 overflow-hidden">
          {isBooting || !previewUrl ? (
            <div
              className={`flex h-full flex-col items-center justify-center gap-3 ${
                mobile ? "bg-[#f8f8f6]" : "bg-zinc-950"
              }`}
            >
              <div className={`h-10 w-10 animate-spin rounded-full border-2 ${mobile ? "border-zinc-200 border-t-zinc-900" : "border-zinc-700 border-t-blue-400"}`} />
              <p className={`text-sm ${mobile ? "text-zinc-500" : "text-zinc-400"}`}>
                {progress === "writing" && "Writing files..."}
                {progress === "installing" && "Installing dependencies..."}
                {progress === "starting" && "Starting dev server..."}
                {progress === "error" && "Something went wrong"}
                {!progress && "Preparing workspace..."}
              </p>
            </div>
          ) : (
            <LivePreview
              url={previewUrl}
              isBooting={isBooting}
              progress={progress}
              onElementSelected={onElementSelected}
              mobile={mobile}
            />
          )}
        </div>
      ) : mobile ? (
        <div className="flex min-h-0 flex-1 flex-col bg-zinc-950">
          <div className="h-36 shrink-0 border-b border-zinc-800">
            <FileTree
              files={files}
              selectedFile={selectedFile}
              onSelect={setSelectedFile}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {selectedFile ? (
              <CodeEditor filePath={selectedFile} content={selectedContent} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-zinc-500">Select a file</div>
            )}
          </div>
        </div>
      ) : (
        <Group orientation="vertical" className="flex-1">
          <Panel defaultSize={65} minSize={30}>
            <div className="flex h-full">
              <div className="w-48 overflow-hidden border-r border-zinc-800">
                <FileTree files={files} selectedFile={selectedFile} onSelect={setSelectedFile} />
              </div>
              <div className="flex-1 overflow-hidden">
                {selectedFile ? (
                  <div className="flex h-full flex-col">
                    <div className="border-b border-zinc-800 px-3 py-1 text-xs text-zinc-500">{selectedFile}</div>
                    <div className="flex-1 overflow-hidden">
                      <CodeEditor filePath={selectedFile} content={selectedContent} />
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">Select a file</div>
                )}
              </div>
            </div>
          </Panel>
          <Separator className="h-1 cursor-row-resize bg-zinc-800 hover:bg-zinc-700" />
          <Panel defaultSize={35} minSize={10} collapsible>
            <WorkspaceTerminal output={terminalOutput} />
          </Panel>
        </Group>
      )}
    </div>
  );
}
