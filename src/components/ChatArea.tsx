"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, getToolName, type UIMessage } from "ai";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { useChatHistory } from "@/hooks/use-chat-history";
import { ChatInput } from "./ChatInput";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ArtifactBadge } from "./ArtifactBadge";
import { parseArtifacts } from "@/lib/workspace/artifact-parser";
import type { ElementInfo } from "./workspace/LivePreview";
import { Id } from "../../convex/_generated/dataModel";

export function ChatArea({
  conversationId,
  onArtifactCreated,
  selectedElement,
  onElementUsed,
}: {
  conversationId: Id<"conversations">;
  onArtifactCreated?: () => void;
  selectedElement?: ElementInfo | null;
  onElementUsed?: () => void;
}) {
  const { convexUserId } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");

  const { conversation, loadedMessages, saveMessages, generateTitle } =
    useChatHistory(convexUserId, conversationId);
  const createArtifact = useMutation(api.artifacts.create);
  const savedArtifactsRef = useRef<Set<string>>(new Set());

  const { messages, setMessages, sendMessage, status, error } = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        conversationId,
        userId: convexUserId,
        composioSessionId: conversation?.composioSessionId ?? null,
      },
    }),
  });

  // Hydrate messages when conversation changes
  const prevConvIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (conversationId !== prevConvIdRef.current) {
      prevConvIdRef.current = conversationId;
      loadedRef.current = false;
    }
    if (!loadedRef.current && loadedMessages !== undefined) {
      loadedRef.current = true;
      if (loadedMessages.length > 0) {
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    }
  }, [conversationId, loadedMessages, setMessages]);

  // Debounced save
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (messagesRef.current.length > 0) {
        saveMessages(conversationId, messagesRef.current);
      }
    }, 1000);
  }, [conversationId, saveMessages]);

  // Save when streaming finishes
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready") {
      debouncedSave();
      // Auto-title on first assistant response
      if (conversation?.title === "New Chat") {
        const lastAssistant = messagesRef.current
          .filter((m) => m.role === "assistant")
          .pop();
        if (lastAssistant) {
          const text =
            lastAssistant.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text"
              )
              .map((p) => p.text)
              .join("") || "";
          if (text) generateTitle(conversationId, text);
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, debouncedSave, conversation?.title, conversationId, generateTitle]);

  // Save on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (messagesRef.current.length > 0) {
        saveMessages(conversationId, messagesRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    let text = input;

    // Inject selected element context so AI knows what to edit
    if (selectedElement) {
      text = `[User selected element: <${selectedElement.tagName}> with selector "${selectedElement.selector}" containing text "${selectedElement.textContent.slice(0, 60)}"]\n\n${text}`;
      onElementUsed?.();
    }

    setInput("");
    sendMessage({ text });
  };

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-6">
        {messages.length === 0 && (
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
                    const { cleanText, artifacts } = parseArtifacts(part.text);
                    // Save artifacts to Convex (deduplicated)
                    for (const artifact of artifacts) {
                      if (!savedArtifactsRef.current.has(artifact.id)) {
                        savedArtifactsRef.current.add(artifact.id);
                        createArtifact({
                          conversationId,
                          artifactId: artifact.id,
                          title: artifact.title,
                          actions: artifact.actions,
                        });
                        onArtifactCreated?.();
                      }
                    }
                    return (
                      <span key={i}>
                        <span className="whitespace-pre-wrap">
                          {cleanText
                            .split(/(https?:\/\/[^\s)]+)/g)
                            .map((seg, j) =>
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
                        {artifacts.map((a) => (
                          <ArtifactBadge key={a.id} title={a.title} />
                        ))}
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
                        state={
                          toolPart.state === "output-available"
                            ? "result"
                            : "call"
                        }
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

      {selectedElement && (
        <div className="mx-4 mb-1 flex items-center gap-2 rounded bg-blue-900/30 px-3 py-1.5 text-xs text-blue-300">
          <span className="font-medium">Selected:</span>
          <code className="truncate">{selectedElement.selector}</code>
          <button onClick={onElementUsed} className="ml-auto text-blue-400 hover:text-white">&times;</button>
        </div>
      )}
      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={handleSend}
        disabled={isLoading}
      />
    </div>
  );
}
