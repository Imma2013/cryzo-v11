"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter, useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import {
  CalendarDays,
  CreditCard,
  Home,
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
import { ThemeToggle } from "@/providers/ThemeProvider";

export function Sidebar() {
  const { user, userId, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeId = params?.conversationId as string | undefined;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip",
  );
  const createConversation = useMutation(api.conversations.create);
  const removeConversation = useMutation(api.conversations.remove);

  useEffect(() => {
    const open = () => setMobileOpen(true);
    window.addEventListener("cryzo:open-sidebar", open);
    return () => window.removeEventListener("cryzo:open-sidebar", open);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

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
    setMobileOpen(false);
    withNavigationFallback(href);
  };

  const handleNewChat = async () => {
    if (!userId) return;
    const id = await createConversation({ userId });
    setMobileOpen(false);
    router.push(`/chat/${id}`);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: Id<"conversations">,
  ) => {
    e.stopPropagation();
    await removeConversation({ id });
    if (activeId === id) {
      setMobileOpen(false);
      router.push("/chat");
      withNavigationFallback("/chat");
    }
  };

  const renderContents = (mobile: boolean) => {
    const collapsed = mobile ? false : isCollapsed;

    return (
      <>
        <div className="flex items-center justify-between p-3">
          {!collapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <img src="/icon.svg" alt="" className="h-9 w-9 shrink-0 rounded-xl" />
              <h1 className="truncate text-lg font-bold text-white">Cryzo</h1>
            </div>
          )}

          <div className="flex items-center gap-1">
            {!collapsed && (
              <button
                type="button"
                onClick={handleNewChat}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label="New chat"
              >
                <Plus size={19} />
              </button>
            )}

            {mobile ? (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label="Close navigation"
              >
                <X size={22} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCollapsed((prev) => !prev)}
                className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            )}
          </div>
        </div>

        {collapsed && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              aria-label="New chat"
            >
              <Plus size={18} />
            </button>
          </div>
        )}

        {!collapsed && mobile && (
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={handleNewChat}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              <Plus size={17} />
              New project
            </button>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-1.5 pb-2">
          {!collapsed && conversations && conversations.length > 0 && (
            <div className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Projects
            </div>
          )}

          {conversations?.map((conv) => (
            <div
              key={conv._id}
              className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2.5 text-sm transition-colors ${
                activeId === conv._id
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
              }`}
              title={collapsed ? conv.title : undefined}
            >
              <Link
                href={`/chat/${conv._id}`}
                onClick={() => navigate(`/chat/${conv._id}`)}
                className="flex min-w-0 flex-1 items-center gap-2.5"
              >
                <MessageSquare size={15} className="shrink-0" />
                {!collapsed && (
                  <>
                    <div className="flex-1 truncate">{conv.title}</div>
                    <span className="hidden text-xs text-zinc-600 group-hover:block">
                      {formatRelativeTime(conv.updatedAt)}
                    </span>
                  </>
                )}
              </Link>
              {!collapsed && (
                <button
                  type="button"
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
            href="/chat/marketing"
            onClick={() => navigate("/chat/marketing")}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm transition-colors ${
              pathname === "/chat/marketing" || pathname === "/chat/social"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
            }`}
            title={collapsed ? "Marketing" : undefined}
          >
            <CalendarDays size={15} className="shrink-0" />
            {!collapsed && <span>Marketing</span>}
          </Link>
          <Link
            href="/chat/apps"
            onClick={() => navigate("/chat/apps")}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm transition-colors ${
              pathname === "/chat/apps"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
            }`}
            title={collapsed ? "Apps" : undefined}
          >
            <Plug size={15} className="shrink-0" />
            {!collapsed && <span>Apps</span>}
          </Link>
          <Link
            href="/chat/billing"
            onClick={() => navigate("/chat/billing")}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2.5 text-sm transition-colors ${
              pathname === "/chat/billing"
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/60 hover:text-white"
            }`}
            title={collapsed ? "Billing" : undefined}
          >
            <CreditCard size={15} className="shrink-0" />
            {!collapsed && <span>Billing</span>}
          </Link>
        </div>

        <div className="border-t border-zinc-800 p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <ThemeToggle />
              <ThemeToggle />
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200">
                {(user?.name || user?.email || "C").slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 truncate text-sm text-zinc-400">
                {user?.name || user?.email}
              </div>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <aside
        className={`hidden h-full shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 md:flex ${
          isCollapsed ? "w-12" : "w-64"
        }`}
      >
        {renderContents(false)}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 backdrop-blur-[1px]"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          />
          <aside className="relative z-10 flex h-full w-[84vw] max-w-[360px] flex-col border-r border-zinc-800 bg-[#111113] shadow-2xl shadow-black">
            {renderContents(true)}
          </aside>
        </div>
      )}
    </>
  );
}
