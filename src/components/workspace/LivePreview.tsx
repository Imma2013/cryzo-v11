"use client";

import { RefreshCw, Loader2 } from "lucide-react";
import { useRef } from "react";
import type { ProgressStage } from "@/lib/workspace/action-runner";

export function LivePreview({
  url,
  isBooting,
  progress,
}: {
  url: string | null;
  isBooting: boolean;
  progress: ProgressStage;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = () => {
    if (iframeRef.current && url) {
      iframeRef.current.src = url;
    }
  };

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-900 text-sm text-zinc-500">
        {isBooting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
            <span>
              {progress === "writing" && "Writing project files..."}
              {progress === "installing" && "Installing dependencies..."}
              {progress === "starting" && "Starting dev server..."}
              {progress === "error" && "Failed to start. Check terminal."}
            </span>
          </div>
        ) : progress === "error" ? (
          <span className="text-red-400">Dev server failed. Check terminal.</span>
        ) : (
          <span>Waiting for dev server...</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-1.5">
        <button
          onClick={handleRefresh}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <RefreshCw size={14} />
        </button>
        <div className="flex-1 truncate rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
          {url}
        </div>
      </div>
      <iframe
        ref={iframeRef}
        src={url}
        className="flex-1"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
