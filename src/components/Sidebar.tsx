"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter, useParams } from "next/navigation";
import { formatRelativeTime } from "@/lib/utils";
import {
  Plus,
  LogOut,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";

export function Sidebar() {
  const { firebaseUser, convexUserId, logout } = useAuth();
  const router = useRouter();
  const params = useParams();
  const activeId = params?.conversationId as string | undefined;

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const conversations = useQuery(
    api.conversations.list,
    convexUserId ? { userId: convexUserId } : "skip"
  );
  const createConversation = useMutation(api.conversations.create);
  const removeConversation = useMutation(api.conversations.remove);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const handleNewChat = async () => {
    if (!convexUserId) return;
    const id = await createConversation({ userId: convexUserId });
    router.push(`/chat/${id}`);
  };

  const handleDelete = async (
    e: React.MouseEvent,
    id: Id<"conversations">
  ) => {
    e.stopPropagation();
    await removeConversation({ id });
    if (activeId === id) router.push("/chat");
  };

  return (
    <aside
      className={`flex h-full flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-200 ${
        isCollapsed ? "w-12" : "w-64"
      }`}
    >
      <div className="flex items-center justify-between p-3">
        {!isCollapsed && (
          <h1 className="text-lg font-bold text-white">Cryzo</h1>
        )}
        <div className="flex items-center gap-1">
          {!isCollapsed && (
            <button
              onClick={handleNewChat}
              className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <Plus size={18} />
            </button>
          )}
          <button
            onClick={toggleCollapse}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
          </button>
        </div>
      </div>

      {isCollapsed && (
        <div className="flex justify-center py-2">
          <button
            onClick={handleNewChat}
            className="rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <Plus size={18} />
          </button>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-1">
        {conversations?.map((conv) => (
          <div
            key={conv._id}
            onClick={() => router.push(`/chat/${conv._id}`)}
            className={`group mb-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors ${
              activeId === conv._id
                ? "bg-zinc-800 text-white"
                : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
            }`}
            title={isCollapsed ? conv.title : undefined}
          >
            <MessageSquare size={14} className="shrink-0" />
            {!isCollapsed && (
              <>
                <div className="flex-1 truncate">{conv.title}</div>
                <span className="hidden text-xs text-zinc-600 group-hover:block">
                  {formatRelativeTime(conv.updatedAt)}
                </span>
                <button
                  onClick={(e) => handleDelete(e, conv._id)}
                  className="hidden rounded p-1 text-zinc-500 hover:text-red-400 group-hover:block"
                >
                  <Trash2 size={12} />
                </button>
              </>
            )}
          </div>
        ))}
      </nav>

      <div className="border-t border-zinc-800 p-3">
        {isCollapsed ? (
          <button
            onClick={logout}
            className="mx-auto block rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <LogOut size={16} />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex-1 truncate text-sm text-zinc-400">
              {firebaseUser?.displayName || firebaseUser?.email}
            </div>
            <button
              onClick={logout}
              className="rounded-md p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
