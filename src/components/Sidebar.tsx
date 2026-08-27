"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter, useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { CryzoLogo } from "@/components/CryzoLogo";
import {
  CreditCard,
  Folder,
  LogOut,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";

type SidebarProps = {
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
  onClose?: () => void;
};

export function Sidebar({
  variant = "desktop",
  onNavigate,
  onClose,
}: SidebarProps) {
  const { user, userId, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeId = params?.conversationId as string | undefined;
  const [isCollapsed, setIsCollapsed] = useState(false);

  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip",
  );
  const createConversation = useMutation(api.conversations.create);
  const removeConversation = useMutation(api.conversations.remove);

  const withNavigationFallback = (href: string) => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === href) return;

    window.setTimeout(() => {
      if (window.location.pathname !== href) {
        window.location.assign(href);
      }
    }, 300);
  };

  const navigate = (href: string) => {
    onNavigate?.();
    withNavigationFallback(href);
  };

  const handleNewChat = async () => {
    if (!userId) return;
    const id = await createConversation({ userId });
    onNavigate?.();
    router.push(`/chat/${id}`);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: Id<"conversations">,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    await removeConversation({ id });
    if (activeId === id) {
      onNavigate?.();
      router.push("/chat");
      withNavigationFallback("/chat");
    }
  };

  if (variant === "mobile") {
    const accountLabel = user?.name || user?.email || "Account";
    const initial = accountLabel.slice(0, 1).toUpperCase();

    return (
      <aside className="flex h-full w-full flex-col bg-[#f7f7f5] text-zinc-900">
        <div className="flex h-16 shrink-0 items-center border-b border-zinc-200 px-4">
          <CryzoLogo showWordmark className="text-zinc-950" />
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-950"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-left text-base font-medium shadow-sm"
          >
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-300 text-zinc-700">
              <Plus size={18} />
            </span>
            New
          </button>

          <nav className="space-y-1">
            <Link
              href="/chat"
              onClick={() => navigate("/chat")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                pathname === "/chat"
                  ? "bg-zinc-200 font-medium text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-200/70"
              }`}
            >
              <Folder size={20} />
              Projects
            </Link>
            <Link
              href="/chat/apps"
              onClick={() => navigate("/chat/apps")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                pathname === "/chat/apps"
                  ? "bg-zinc-200 font-medium text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-200/70"
              }`}
            >
              <Plug size={20} />
              Integrations
            </Link>
            <Link
              href="/chat/billing"
              onClick={() => navigate("/chat/billing")}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-[15px] transition-colors ${
                pathname === "/chat/billing"
                  ? "bg-zinc-200 font-medium text-zinc-950"
                  : "text-zinc-700 hover:bg-zinc-200/70"
              }`}
            >
              <CreditCard size={20} />
              Billing
            </Link>
          </nav>

          <div className="mb-2 mt-6 px-3 text-sm font-medium text-zinc-500">Recent</div>
          <div className="space-y-1">
            {conversations?.slice(0, 8).map((conv) => (
              <div
                key={conv._id}
                className={`group flex items-center rounded-xl transition-colors ${
                  activeId === conv._id
                    ? "bg-zinc-200 text-zinc-950"
                    : "text-zinc-700 hover:bg-zinc-200/70"
                }`}
              >
                <Link
                  href={`/chat/${conv._id}`}
                  onClick={() => navigate(`/chat/${conv._id}`)}
                  className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                >
                  <MessageSquare size={18} className="shrink-0" />
                  <span className="truncate text-[15px]">{conv.title}</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, conv._id)}
                  className="mr-2 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 opacity-70 hover:bg-zinc-300 hover:text-red-500"
                  aria-label={`Delete ${conv.title}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t border-zinc-200 p-3">
          <Link
            href="/chat/billing"
            onClick={() => navigate("/chat/billing")}
            className="block rounded-xl border border-zinc-300 bg-white px-4 py-3 shadow-sm"
          >
            <div className="font-medium text-zinc-950">Upgrade your plan</div>
            <div className="mt-0.5 text-sm text-zinc-500">Unlock more credits</div>
          </Link>

          <div className="flex items-center gap-3 rounded-xl px-3 py-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-700 text-sm font-semibold text-white">
              {initial}
            </div>
            <div className="min-w-0 flex-1 truncate text-sm font-medium">{accountLabel}</div>
            <button
              type="button"
              onClick={() => {
                onNavigate?.();
                signOut();
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200 hover:text-zinc-950"
              aria-label="Sign out"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between p-3">
        {!isCollapsed && <h1 className="text-lg font-bold text-white">Cryzo</h1>}
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <button
              onClick={handleNewChat}
              className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label="New chat"
            >
              <Plus size={18} />
            </button>
          )}
          <button
            onClick={() => setIsCollapsed((prev) => !prev)}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      {isCollapsed && (
        <div className="flex justify-center py-2">
          <button
            onClick={handleNewChat}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="New chat"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-1">
        {conversations?.map((conv) => (
          <div
            key={conv._id}
            className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
              activeId === conv._id
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
            title={isCollapsed ? conv.title : undefined}
          >
            <Link
              href={`/chat/${conv._id}`}
              onClick={() => navigate(`/chat/${conv._id}`)}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              <MessageSquare size={14} className="shrink-0" />
              {!isCollapsed && (
                <>
                  <div className="flex-1 truncate">{conv.title}</div>
                  <span className="hidden text-xs text-zinc-600 group-hover:block">
                    {formatRelativeTime(conv.updatedAt)}
                  </span>
                </>
              )}
            </Link>
            {!isCollapsed && (
              <button
                onClick={(e) => handleDelete(e, conv._id)}
                className="hidden rounded p-1 text-zinc-500 hover:text-red-400 group-hover:block"
                aria-label={`Delete ${conv.title}`}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 px-2 py-2">
        <Link
          href="/chat/apps"
          onClick={() => navigate("/chat/apps")}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
            pathname === "/chat/apps"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
          }`}
          title={isCollapsed ? "Apps" : undefined}
        >
          <Plug size={14} className="shrink-0" />
          {!isCollapsed && <span>Apps</span>}
        </Link>
        <Link
          href="/chat/billing"
          onClick={() => navigate("/chat/billing")}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
            pathname === "/chat/billing"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
          }`}
          title={isCollapsed ? "Billing" : undefined}
        >
          <CreditCard size={14} className="shrink-0" />
          {!isCollapsed && <span>Billing</span>}
        </Link>
      </div>

      <div className="border-t border-zinc-800 p-3">
        {isCollapsed ? (
          <button
            onClick={() => signOut()}
            className="mx-auto block rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-sm text-zinc-400">{user?.name || user?.email}</div>
            <button
              onClick={() => signOut()}
              className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
