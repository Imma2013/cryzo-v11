"use client";

import { useEffect, useState } from "react";
import { Panel, Group, Separator } from "react-resizable-panels";
import {
  AlertCircle,
  ArrowLeft,
  Code2,
  ExternalLink,
  Eye,
  Loader2,
  Mic,
  MoreHorizontal,
  RefreshCw,
} from "lucide-react";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  refreshStreamingRuntimeLogs,
  restartStreamingRuntime,
} from "@/lib/workspace/streaming-runtime";
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
  onBackToChat,
  mobile = false,
}: {
  conversationId: Id<"conversations">;
  onElementSelected?: (info: ElementInfo) => void;
  onStatusChange?: (status: WorkspaceStatus) => void;
  onBackToChat?: () => void;
  mobile?: boolean;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  const [retrying, setRetrying] = useState(false);

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

  useEffect(() => {
    if (!error) setShowErrorLogs(false);
  }, [error]);

  const selectedContent = selectedFile ? files[selectedFile]?.content || "" : "";
  const errorSummary = error?.split("\n")[0] || "The preview server could not start.";

  const retryPreview = async () => {
    if (retrying) return;
    setRetrying(true);
    setShowErrorLogs(false);
    try {
      await restartStreamingRuntime(String(conversationId));
    } catch {
      // The runtime store exposes the actionable error and diagnostics.
    } finally {
      setRetrying(false);
    }
  };

  const viewLogs = async () => {
    try {
      await refreshStreamingRuntimeLogs(String(conversationId));
    } catch {
      // Existing runtime output is still useful if diagnostics refresh fails.
    }
    setShowErrorLogs(true);
  };

  const loadingContent = error ? (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-6 py-8 text-center text-white">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400">
        <AlertCircle size={24} />
      </div>
      <h3 className="mt-4 text-lg font-semibold">Preview couldn&apos;t start</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">{errorSummary}</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void retryPreview()}
          disabled={retrying}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black disabled:opacity-50"
        >
          <RefreshCw size={16} className={retrying ? "animate-spin" : ""} />
          {retrying ? "Restarting..." : "Retry preview"}
        </button>
        <button
          type="button"
          onClick={() => void viewLogs()}
          className="inline-flex h-10 items-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-200"
        >
          View logs
        </button>
      </div>
      {showErrorLogs && (
        <pre className="mt-5 max-h-[38vh] w-full max-w-2xl overflow-auto rounded-xl border border-zinc-800 bg-black p-4 text-left text-[11px] leading-5 text-zinc-400">
          {terminalOutput || error}
        </pre>
      )}
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-zinc-700 border-t-blue-400" />
      <div>
        <p className="text-sm font-medium text-zinc-300">
          {progress === "writing" && "Writing files..."}
          {progress === "installing" && "Installing dependencies..."}
          {progress === "starting" && "Starting preview..."}
          {!progress && "Preparing preview..."}
        </p>
        {mobile && (
          <p className="mt-1 text-xs text-zinc-600">
            You can switch back to Chat while Cryzo finishes building.
          </p>
        )}
      </div>
    </div>
  );

  if (mobile) {
    const handleVoice = () => {
      onBackToChat?.();
      window.setTimeout(() => {
        const voiceButton = document.querySelector<HTMLButtonElement>(
          'button[title="Start voice input"]',
        );
        voiceButton?.click();
      }, 120);
    };

    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden bg-zinc-950">
        <div className="min-h-0 flex-1 overflow-hidden">
          {isBooting || !previewUrl || error ? (
            loadingContent
          ) : (
            <LivePreview
              url={previewUrl}
              isBooting={isBooting}
              progress={progress}
              mobile
              refreshToken={refreshToken}
            />
          )}
        </div>

        <div className="relative z-40 shrink-0 border-t border-zinc-200 bg-[#fafafa] px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 text-black">
          {mobileMenuOpen && (
            <div className="absolute bottom-[calc(100%+0.5rem)] right-4 w-56 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-2xl shadow-black/20">
              <button
                type="button"
                onClick={() => {
                  setRefreshToken((value) => value + 1);
                  setMobileMenuOpen(false);
                }}
                disabled={!previewUrl}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
              >
                <RefreshCw size={17} />
                Refresh preview
              </button>
              <button
                type="button"
                onClick={() => {
                  if (previewUrl) {
                    window.open(previewUrl, "_blank", "noopener,noreferrer");
                  }
                  setMobileMenuOpen(false);
                }}
                disabled={!previewUrl}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
              >
                <ExternalLink size={17} />
                Open site
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  void retryPreview();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-800 hover:bg-zinc-100"
              >
                <RefreshCw size={17} />
                Restart server
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToChat}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-white px-4 text-base font-medium text-black shadow-sm ring-1 ring-zinc-100"
            >
              <ArrowLeft size={20} />
              Chat
            </button>

            <button
              type="button"
              onClick={handleVoice}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-sm ring-1 ring-zinc-100"
              aria-label="Voice edit"
            >
              <Mic size={22} />
            </button>

            <div className="min-w-0 flex-1" />

            <button
              type="button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-sm ring-1 ring-zinc-100"
              aria-label="Preview options"
            >
              <MoreHorizontal size={23} />
            </button>

            <PublishControls
              files={files}
              conversationId={conversationId}
              disabled={isBooting || !!error}
              variant="mobile"
            />
          </div>
        </div>
      </div>
    );
  }

  const previewContent = isBooting || !previewUrl || error ? (
    loadingContent
  ) : (
    <LivePreview
      url={previewUrl}
      isBooting={isBooting}
      progress={progress}
      onElementSelected={onElementSelected}
    />
  );

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
              <button
                type="button"
                onClick={() => void retryPreview()}
                className="flex items-center gap-1 text-red-400 hover:text-red-300"
              >
                <AlertCircle size={12} />
                Retry preview
              </button>
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
