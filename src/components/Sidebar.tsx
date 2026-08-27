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
  Plug,
  Plus,
  LogOut,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
} from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";

export function Sidebar() {
  const { user, userId, signOut } = useAuth();
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const activeId = params?.conversationId as string | undefined;

  const [isCollapsed, setIsCollapsed] = useState(false);

  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip"
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

  const toggleCollapse = () => {
    setIsCollapsed((prev) => !prev);
  };

  const handleNewChat = async () => {
    if (!userId) return;
    const id = await createConversation({ userId });
    router.push(`/chat/${id}`);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: Id<"conversations">
  ) => {
    e.stopPropagation();
    await removeConversation({ id });
    if (activeId === id) {
      router.push("/chat");
      withNavigationFallback("/chat");
    }
  };

  return (
    <aside
      className={`flex h-full w-14 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 ${
        isCollapsed ? "md:w-12" : "md:w-64"
      }`}
    >
      <div className="flex items-center justify-center p-2 md:justify-between md:p-3">
        <Link
          href="/chat"
          onClick={() => withNavigationFallback("/chat")}
          className="inline-flex items-center md:hidden"
          aria-label="Cryzo home"
        >
          <CryzoLogo size={28} />
        </Link>

        {!isCollapsed && (
          <h1 className="hidden text-lg font-bold text-white md:block">Cryzo</h1>
        )}

        <div className="hidden items-center gap-1 md:flex">
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
            onClick={toggleCollapse}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
      </div>

      <div className="flex justify-center border-y border-zinc-900 py-2 md:hidden">
        <button
          onClick={handleNewChat}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          aria-label="New chat"
          title="New chat"
        >
          <Plus size={20} />
        </button>
      </div>

      {isCollapsed && (
        <div className="hidden justify-center py-2 md:flex">
          <button
            onClick={handleNewChat}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            aria-label="New chat"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-1 py-1">
        {conversations?.map((conv) => (
          <div
            key={conv._id}
            className={`group mb-1 flex cursor-pointer items-center justify-center rounded-lg px-1 py-2 text-sm transition-colors md:justify-start md:px-2 ${
              activeId === conv._id
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
            title={conv.title}
          >
            <Link
              href={`/chat/${conv._id}`}
              onClick={() => withNavigationFallback(`/chat/${conv._id}`)}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 md:justify-start"
            >
              <MessageSquare size={16} className="shrink-0" />
              {!isCollapsed && (
                <div className="hidden min-w-0 flex-1 items-center md:flex">
                  <div className="flex-1 truncate">{conv.title}</div>
                  <span className="hidden text-xs text-zinc-600 group-hover:block">
                    {formatRelativeTime(conv.updatedAt)}
                  </span>
                </div>
              )}
            </Link>
            {!isCollapsed && (
              <button
                onClick={(e) => handleDelete(e, conv._id)}
                className="hidden rounded p-1 text-zinc-500 hover:text-red-400 md:group-hover:block"
                aria-label={`Delete ${conv.title}`}
              >
                <Trash2 size={12} />
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 px-1 py-2 md:px-2">
        <Link
          href="/chat/apps"
          onClick={() => withNavigationFallback("/chat/apps")}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors md:justify-start ${
            pathname === "/chat/apps"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
          }`}
          title="Apps"
        >
          <Plug size={16} className="shrink-0" />
          {!isCollapsed && <span className="hidden md:inline">Apps</span>}
        </Link>
        <Link
          href="/chat/billing"
          onClick={() => withNavigationFallback("/chat/billing")}
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors md:justify-start ${
            pathname === "/chat/billing"
              ? "bg-zinc-800 text-white"
              : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
          }`}
          title="Billing"
        >
          <CreditCard size={16} className="shrink-0" />
          {!isCollapsed && <span className="hidden md:inline">Billing</span>}
        </Link>
      </div>

      <div className="border-t border-zinc-800 p-2 md:p-3">
        <button
          onClick={() => signOut()}
          className="mx-auto flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white md:hidden"
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>

        <div className="hidden md:block">
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
              <div className="flex-1 truncate text-sm text-zinc-400">
                {user?.name || user?.email}
              </div>
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
      </div>
    </aside>
  );
}
