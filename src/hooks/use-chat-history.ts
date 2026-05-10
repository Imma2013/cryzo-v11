"use client";

import { useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { UIMessage } from "ai";

export function useChatHistory(
  userId: Id<"users"> | null,
  conversationId?: Id<"conversations">
) {
  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip"
  );

  const rawMessages = useQuery(
    api.messages.list,
    conversationId ? { conversationId } : "skip"
  );

  const conversation = useQuery(
    api.conversations.get,
    conversationId ? { id: conversationId } : "skip"
  );

  const createConversation = useMutation(api.conversations.create);
  const removeConversation = useMutation(api.conversations.remove);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const saveAllMutation = useMutation(api.messages.saveAll);

  const loadedMessages: UIMessage[] | undefined = rawMessages?.map((doc) => {
    if (doc.parts) {
      return {
        id: doc._id,
        role: doc.role,
        parts: doc.parts,
      } as UIMessage;
    }
    // Legacy fallback for messages without parts
    const parts: any[] = [{ type: "text", text: doc.content }];
    if (doc.toolCalls && Array.isArray(doc.toolCalls)) {
      for (const tc of doc.toolCalls) {
        parts.push(tc);
      }
    }
    return { id: doc._id, role: doc.role, parts } as UIMessage;
  });

  const createChat = useCallback(async () => {
    if (!userId) throw new Error("Not authenticated");
    return await createConversation({ userId });
  }, [userId, createConversation]);

  const deleteChat = useCallback(
    async (id: Id<"conversations">) => {
      await removeConversation({ id });
    },
    [removeConversation]
  );

  const saveMessages = useCallback(
    (convId: Id<"conversations">, messages: UIMessage[]) => {
      const storable = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => {
          const textContent =
            m.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("") || "";
          return {
            role: m.role as "user" | "assistant",
            content: textContent,
            parts: JSON.parse(JSON.stringify(m.parts)),
          };
        });
      if (storable.length > 0) {
        saveAllMutation({ conversationId: convId, messages: storable });
      }
    },
    [saveAllMutation]
  );

  const generateTitle = useCallback(
    (convId: Id<"conversations">, text: string) => {
      const title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
      updateTitle({ id: convId, title });
    },
    [updateTitle]
  );

  return {
    conversations,
    conversation,
    loadedMessages,
    createChat,
    deleteChat,
    saveMessages,
    generateTitle,
  };
}
