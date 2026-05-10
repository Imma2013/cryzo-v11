"use client";

import { RefreshCw } from "lucide-react";
import { useRef } from "react";

export function LivePreview({ url }: { url: string | null }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleRefresh = () => {
    if (iframeRef.current && url) {
      iframeRef.current.src = url;
    }
  };

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-900 text-sm text-zinc-500">
        Waiting for dev server...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
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
        className="flex-1 bg-white"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />
    </div>
  );
}
