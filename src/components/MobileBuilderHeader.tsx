"use client";

import { ArrowLeft, Loader2, Menu, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileBuilderView = "chat" | "preview";

export function MobileBuilderHeader({
  title,
  view,
  canPreview,
  isBuilding,
  onPreview,
  onBackToChat,
}: {
  title: string;
  view: MobileBuilderView;
  canPreview: boolean;
  isBuilding?: boolean;
  onPreview?: () => void;
  onBackToChat?: () => void;
}) {
  const openSidebar = () => {
    window.dispatchEvent(new Event("cryzo:open-sidebar"));
  };

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-800 bg-[#111113] px-4 md:hidden">
      {view === "preview" ? (
        <button
          type="button"
          onClick={onBackToChat}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-2 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
          aria-label="Back to chat"
        >
          <ArrowLeft size={20} />
          <span>Chat</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={openSidebar}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-200 transition-colors hover:bg-zinc-800"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold text-white">
          {title || "Cryzo"}
        </div>
      </div>

      {view === "chat" ? (
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold transition-all",
            canPreview
              ? "bg-blue-600 text-white shadow-lg shadow-blue-950/30 hover:bg-blue-500"
              : "cursor-not-allowed bg-zinc-800 text-zinc-500",
          )}
        >
          {isBuilding && canPreview ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <Play size={17} fill="currentColor" />
          )}
          Preview
        </button>
      ) : (
        <div className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400">
          Preview
        </div>
      )}
    </header>
  );
}
