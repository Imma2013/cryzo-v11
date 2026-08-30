"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Box,
  Database,
  Github,
  KeyRound,
  Loader2,
  Menu,
  MoreHorizontal,
  Play,
} from "lucide-react";
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
  const [menuOpen, setMenuOpen] = useState(false);

  const openSidebar = () => {
    window.dispatchEvent(new Event("cryzo:open-sidebar"));
  };

  const goToApps = (hash = "") => {
    setMenuOpen(false);
    window.location.assign(`/chat/apps${hash}`);
  };

  const openModels = () => {
    setMenuOpen(false);
    window.dispatchEvent(new Event("cryzo:open-model-picker"));
  };

  return (
    <header className="relative flex min-h-16 shrink-0 items-center gap-2 border-b border-zinc-800 bg-[#111113] px-4 md:hidden">
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

      {view === "chat" && (
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Project menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={21} />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
                aria-label="Close project menu"
              />
              <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl shadow-black">
                <button type="button" onClick={() => goToApps()} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900">
                  <Box size={16} />Apps
                </button>
                <button type="button" onClick={() => goToApps("#github")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900">
                  <Github size={16} />GitHub
                </button>
                <button type="button" onClick={() => goToApps("#supabase")} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900">
                  <Database size={16} />Supabase
                </button>
                <div className="my-1 border-t border-zinc-800" />
                <button type="button" onClick={openModels} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900">
                  <KeyRound size={16} />Models & API keys
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {view === "chat" ? (
        <button
          type="button"
          onClick={onPreview}
          disabled={!canPreview}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-all",
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
          <span className="hidden min-[390px]:inline">Preview</span>
        </button>
      ) : (
        <div className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-400">
          Preview
        </div>
      )}
    </header>
  );
}
