"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName } from "ai";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import { ChatInput } from "./ChatInput";
import { ToolCallDisplay } from "./ToolCallDisplay";

export function ChatArea({
  conversationId,
}: {
  conversationId: Id<"conversations">;
}) {
  const { convexUserId } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const conversation = useQuery(api.conversations.get, { id: conversationId });
  const savedMessages = useQuery(api.messages.list, { conversationId });
  const createMessage = useMutation(api.messages.create);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const updateSession = useMutation(api.conversations.updateComposioSession);

  const { messages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        conversationId,
        userId: convexUserId,
        composioSessionId: conversation?.composioSessionId ?? null,
      },
    }),
    onFinish: async ({ message }) => {
      const textContent = message.parts
        ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("") || "";

      await createMessage({
        conversationId,
        role: "assistant",
        content: textContent,
        toolCalls: message.parts?.filter((p) => isToolUIPart(p as any)) || undefined,
      });

      if (savedMessages && savedMessages.length <= 1 && textContent.length > 0) {
        const title = textContent.slice(0, 50) + (textContent.length > 50 ? "..." : "");
        await updateTitle({ id: conversationId, title });
      }
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const text = input;
    setInput("");

    await createMessage({
      conversationId,
      role: "user",
      content: text,
    });

    sendMessage({ text });
  };

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && savedMessages?.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-zinc-500">
              Try: &quot;Star the composio repo on GitHub&quot;
            </p>
          </div>
        )}

        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-3 text-sm ${
                  m.role === "user"
                    ? "bg-white text-black"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {m.parts?.map((part, i) => {
                  if (part.type === "text") {
                    return (
                      <span key={i} className="whitespace-pre-wrap">
                        {part.text.split(/(https?:\/\/[^\s)]+)/g).map((seg, j) =>
                          seg.match(/^https?:\/\//) ? (
                            <a
                              key={j}
                              href={seg}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`underline ${
                                m.role === "user"
                                  ? "text-blue-600"
                                  : "text-blue-400"
                              }`}
                            >
                              {seg}
                            </a>
                          ) : (
                            seg
                          )
                        )}
                      </span>
                    );
                  }
                  if (isToolUIPart(part as any)) {
                    const toolPart = part as any;
                    return (
                      <ToolCallDisplay
                        key={i}
                        toolName={getToolName(toolPart)}
                        args={toolPart.input}
                        result={toolPart.output}
                        state={toolPart.state === "output-available" ? "result" : "call"}
                      />
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex gap-3">
              <div className="rounded-lg bg-zinc-800 px-4 py-3 text-sm text-zinc-400">
                Thinking...
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-400">
              Error: {error.message}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={isLoading}
      />
    </div>
  );
}
