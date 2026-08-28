"use client";

import { useEffect, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import { AlertCircle, Code2, Eye, Loader2 } from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import { FileTree } from "./FileTree";
import { CodeEditor } from "./CodeEditor";
import { LivePreview, type ElementInfo } from "./LivePreview";
import { WorkspaceTerminal } from "./WorkspaceTerminal";
import { PublishControls } from "./PublishControls";
import { Id } from "../../../convex/_generated/dataModel";

type ViewMode = "preview" | "code";

export type WorkspaceStatus = {
  isBooting: boolean;
  progress: string | null | undefined;
  previewUrl: string | null | undefined;
};

export function WorkspacePanel({
  conversationId,
  onElementSelected,
  onStatusChange,
  mobile = false,
}: {
  conversationId: Id<"conversations">;
  onElementSelected?: (info: ElementInfo) => void;
  onStatusChange?: (status: WorkspaceStatus) => void;
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

  useEffect(() => {
    onStatusChange?.({
      isBooting,
      progress,
      previewUrl,
    });
  }, [isBooting, onStatusChange, previewUrl, progress]);

  const selectedContent = selectedFile ? files[selectedFile]?.content || "" : "";

  const previewContent = isBooting || !previewUrl ? (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
      <div>
        <p className="text-sm font-medium text-zinc-300">
          {progress === "writing" && "Writing files..."}
          {progress === "installing" && "Installing dependencies..."}
          {progress === "starting" && "Starting preview..."}
          {progress === "error" && "Something went wrong"}
          {!progress && "Preparing preview..."}
        </p>
        {mobile && progress !== "error" && (
          <p className="mt-1 text-xs text-zinc-600">
            You can switch back to Chat while Cryzo finishes building.
          </p>
        )}
      </div>
    </div>
  ) : (
    <LivePreview
      url={previewUrl}
      isBooting={isBooting}
      progress={progress}
      onElementSelected={onElementSelected}
    />
  );

  if (mobile) {
    return <div className="h-full overflow-hidden bg-zinc-950">{previewContent}</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-3 py-2">
        <div className="flex rounded-md bg-zinc-900 p-0.5">
          <button
            type="button"
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
            type="button"
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

        <div className="ml-auto flex items-center gap-3">
          <PublishControls
            files={files}
            conversationId={conversationId}
            disabled={isBooting || !!error}
          />

          <div className="flex items-center gap-2 text-xs">
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
      </div>

      {viewMode === "preview" ? (
        <div className="flex-1 overflow-hidden">{previewContent}</div>
      ) : (
        <Group orientation="vertical" className="flex-1">
          <Panel defaultSize={65} minSize={30}>
            <div className="flex h-full">
              <div className="w-48 overflow-hidden border-r border-zinc-800">
                <FileTree
                  files={files}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              </div>
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
