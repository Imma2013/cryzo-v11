"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  Bot,
  ChevronDown,
  ChevronUp,
  Cloud,
  Code2,
  CreditCard,
  FileText,
  History,
  Layers3,
  Loader2,
  Menu,
  MoreHorizontal,
  Play,
  Plug,
  Rocket,
  Settings,
  Share2,
  Shield,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileBuilderView = "chat" | "preview";

function SheetRow({
  icon,
  label,
  onClick,
  trailing,
  indented = false,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  trailing?: ReactNode;
  indented?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-4 rounded-2xl px-3 text-left text-[17px] font-medium text-zinc-100 transition-colors active:bg-zinc-800/80",
        indented && "pl-8",
      )}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-zinc-200">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing ? <span className="text-zinc-500">{trailing}</span> : null}
    </button>
  );
}

export function MobileBuilderHeader({
  title,
  view,
  canPreview,
  isBuilding,
  conversationId,
  onPreview,
  onBackToChat,
}: {
  title: string;
  view: MobileBuilderView;
  canPreview: boolean;
  isBuilding?: boolean;
  conversationId?: string;
  onPreview?: () => void;
  onBackToChat?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(true);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  const close = () => setMenuOpen(false);

  const openSidebar = () => {
    close();
    window.dispatchEvent(new Event("cryzo:open-sidebar"));
  };

  const go = (href: string) => {
    close();
    window.location.assign(href);
  };

  const openModels = () => {
    close();
    window.dispatchEvent(new Event("cryzo:open-model-picker"));
  };

  const openPreviewArea = (panel?: "code" | "files") => {
    close();
    onPreview?.();
    if (panel) {
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("cryzo:workspace-panel", { detail: { panel } }),
        );
      }, 120);
    }
  };

  const openPublish = () => {
    close();
    onPreview?.();
    window.setTimeout(() => {
      const button = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (candidate) => candidate.textContent?.trim() === "Publish" && !candidate.disabled,
      );
      button?.click();
    }, 180);
  };

  const shareProject = async () => {
    close();
    try {
      if (navigator.share) {
        await navigator.share({ title: title || "Cryzo app", url: window.location.href });
      } else {
        await navigator.clipboard.writeText(window.location.href);
      }
    } catch {
      // Native share sheets can be dismissed without an error state.
    }
  };

  const cloudUrl = conversationId
    ? `/chat/cloud?conversationId=${encodeURIComponent(conversationId)}`
    : "/chat/cloud";

  return (
    <>
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
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Project menu"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={21} />
          </button>
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

      {menuOpen && (
        <div className="fixed inset-0 z-[150] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[2px]"
            onClick={close}
            aria-label="Close project menu"
          />

          <section className="absolute inset-x-0 bottom-0 flex max-h-[84dvh] flex-col overflow-hidden rounded-t-[32px] border-t border-zinc-700/70 bg-[#0e0e10] shadow-[0_-20px_70px_rgba(0,0,0,.55)]">
            <div className="flex shrink-0 justify-center pb-2 pt-3">
              <div className="h-1.5 w-14 rounded-full bg-zinc-700" />
            </div>

            <div className="overflow-y-auto px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
              <div className="space-y-1">
                <SheetRow icon={<Share2 size={23} />} label="Share" onClick={() => void shareProject()} />
                <SheetRow icon={<Rocket size={23} />} label="Publish" onClick={openPublish} />
                <SheetRow icon={<Settings size={23} />} label="Settings" onClick={() => go("/chat/apps")} />
                <SheetRow icon={<Code2 size={23} />} label="Code" onClick={() => openPreviewArea("code")} />
                <SheetRow icon={<FileText size={23} />} label="Files" onClick={() => openPreviewArea("files")} />

                <SheetRow
                  icon={<Layers3 size={23} />}
                  label="More"
                  onClick={() => setMoreOpen((value) => !value)}
                  trailing={moreOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                />

                {moreOpen && (
                  <div className="ml-7 border-l border-zinc-800 pl-2">
                    <SheetRow icon={<Activity size={22} />} label="Analytics" indented onClick={() => go(`${cloudUrl}&tab=usage`)} />
                    <SheetRow icon={<Cloud size={22} />} label="Cloud" indented onClick={() => go(cloudUrl)} />
                    <SheetRow icon={<Sparkles size={22} />} label="AI" indented onClick={openModels} />
                    <SheetRow icon={<Bot size={22} />} label="Agent integrations" indented onClick={() => go("/chat/apps#integrations")} />
                    <SheetRow icon={<CreditCard size={22} />} label="Payments" indented onClick={() => go("/chat/apps#stripe")} />
                    <SheetRow icon={<Plug size={22} />} label="Connectors" indented onClick={() => go("/chat/apps#connections")} />
                    <SheetRow icon={<Shield size={22} />} label="Security" indented onClick={() => go(`${cloudUrl}&tab=security`)} />
                  </div>
                )}

                <div className="my-2 border-t border-zinc-800" />
                <SheetRow icon={<History size={23} />} label="History" onClick={openSidebar} />
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
