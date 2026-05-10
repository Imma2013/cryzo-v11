"use client";

import { Plus } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useRouter } from "next/navigation";

export default function ChatEmptyPage() {
  const { convexUserId } = useAuth();
  const createConversation = useMutation(api.conversations.create);
  const router = useRouter();

  const handleNewChat = async () => {
    if (!convexUserId) return;
    const id = await createConversation({ userId: convexUserId });
    router.push(`/chat/${id}`);
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <h2 className="text-xl font-semibold text-white">Welcome to Cryzo</h2>
      <p className="max-w-md text-center text-sm text-zinc-400">
        Your AI assistant with access to Gmail, GitHub, Slack, Notion, and 1000+
        other apps via Composio.
      </p>
      <button
        onClick={handleNewChat}
        className="flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
      >
        <Plus size={16} />
        New Chat
      </button>
    </div>
  );
}
