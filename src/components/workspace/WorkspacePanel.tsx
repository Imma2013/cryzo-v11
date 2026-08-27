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
      className={`flex h-full min-h-0 flex-col overflow-hidden ${
        mobile
          ? "bg-white"
          : "rounded-lg border border-zinc-800 bg-zinc-950"
      }`}
    >
      <div
        className={`flex shrink-0 items-center gap-1 border-b ${
          mobile
            ? "h-14 border-zinc-200 bg-[#faf9f7] px-3"
            : "border-zinc-800 px-3 py-2"
        }`}
      >
        <div className={`flex rounded-lg p-0.5 ${mobile ? "border border-zinc-200 bg-[#f1efeb]" : "bg-zinc-900"}`}>
          <button
            onClick={() => setViewMode("preview")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "preview"
                ? mobile
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "bg-zinc-700 text-white"
                : mobile
                  ? "text-zinc-500 hover:text-zinc-950"
                  : "text-zinc-400 hover:text-white"
            }`}
          >
            <Eye size={13} />
            Preview
          </button>
          <button
            onClick={() => setViewMode("code")}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "code"
                ? mobile
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "bg-zinc-700 text-white"
                : mobile
                  ? "text-zinc-500 hover:text-zinc-950"
                  : "text-zinc-400 hover:text-white"
            }`}
          >
            <Code2 size={13} />
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
              <span className="flex items-center gap-1 text-red-500" title={error}>
                <AlertCircle size={12} />
                Error
              </span>
            ) : isBooting ? (
              <span className={mobile ? "text-zinc-500" : "text-zinc-400"}>
                <Loader2 size={12} className="mr-1 inline animate-spin" />
                {progress === "preparing" && "Preparing..."}
                {progress === "writing" && "Writing..."}
                {progress === "installing" && "Installing..."}
                {progress === "starting" && "Starting..."}
              </span>
            ) : progress === "ready" ? (
              <span className="text-emerald-600">Ready</span>
            ) : null}
          </div>
        </div>
      </div>

      {viewMode === "preview" ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          {isBooting || !previewUrl ? (
            <div
              className={`flex h-full flex-col items-center justify-center gap-3 px-6 text-center ${
                mobile ? "bg-[#f8f8f6]" : "bg-zinc-950"
              }`}
            >
              {progress !== "error" && (
                <div className={`h-10 w-10 animate-spin rounded-full border-2 ${mobile ? "border-zinc-200 border-t-zinc-900" : "border-zinc-700 border-t-blue-400"}`} />
              )}
              <p className={`text-sm ${progress === "error" ? "text-red-500" : mobile ? "text-zinc-500" : "text-zinc-400"}`}>
                {progress === "preparing" && "Preparing preview..."}
                {progress === "writing" && "Updating files..."}
                {progress === "installing" && "Installing dependencies..."}
                {progress === "starting" && "Starting dev server..."}
                {progress === "error" && (error || "Preview runtime failed")}
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
