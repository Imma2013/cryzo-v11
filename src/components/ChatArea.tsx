"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  isToolUIPart,
  type FileUIPart,
  type UIMessage,
} from "ai";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { useChatHistory } from "@/hooks/use-chat-history";
import { ChatInput, type ChatMode } from "./ChatInput";
import { ToolCallDisplay } from "./ToolCallDisplay";
import { ArtifactBadge } from "./ArtifactBadge";
import AgentPlan from "@/components/ui/agent-plan";
import { parseArtifacts } from "@/lib/workspace/artifact-parser";
import {
  filesToUIParts,
  takeInitialChatMessage,
} from "@/lib/chat/initial-message";
import type { ElementInfo } from "./workspace/LivePreview";
import { Id } from "../../convex/_generated/dataModel";

function hasVisibleAssistantContent(message: UIMessage) {
  return (
    message.parts?.some((part) => {
      if (part.type === "file") return true;
      if (part.type !== "text") return false;

      const { cleanText, artifacts, isStreaming } = parseArtifacts(part.text);
      return cleanText.trim().length > 0 || artifacts.length > 0 || isStreaming;
    }) ?? false
  );
}

export function ChatArea({
  conversationId,
  onArtifactCreated,
  selectedElement,
  onElementUsed,
  appearance = "dark",
}: {
  conversationId: Id<"conversations">;
  onArtifactCreated?: () => void;
  selectedElement?: ElementInfo | null;
  onElementUsed?: () => void;
  appearance?: "dark" | "light";
}) {
  const { userId } = useAuth();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState("");
  const [optimisticMode, setOptimisticMode] = useState<{
    conversationId: string;
    mode: ChatMode;
  } | null>(null);

  const { conversation, loadedMessages, saveMessages, generateTitle } =
    useChatHistory(userId, conversationId);
  const createArtifact = useMutation(api.artifacts.create);
  const updateChatMode = useMutation(api.conversations.updateChatMode);
  const savedArtifactsRef = useRef<Set<string>>(new Set());

  const { messages, setMessages, sendMessage, stop, status, error } = useChat({
    id: conversationId,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: {
        conversationId,
        userId: userId,
        composioSessionId: conversation?.composioSessionId ?? null,
      },
    }),
  });

  const chatMode =
    optimisticMode?.conversationId === conversationId
      ? optimisticMode.mode
      : conversation?.chatMode ?? "build";

  const isLight = appearance === "light";

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

  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messagesRef = useRef<UIMessage[]>(messages);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      if (messagesRef.current.length > 0) {
        saveMessages(conversationId, messagesRef.current);
      }
    }, 1000);
  }, [conversationId, saveMessages]);

  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "ready") {
      debouncedSave();
      if (conversation?.title === "New Chat") {
        const lastAssistant = messagesRef.current
          .filter((m) => m.role === "assistant")
          .pop();
        if (lastAssistant) {
          const text =
            lastAssistant.parts
              ?.filter(
                (p): p is { type: "text"; text: string } => p.type === "text",
              )
              .map((p) => p.text)
              .join("") || "";
          if (text) generateTitle(conversationId, text);
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, debouncedSave, conversation?.title, conversationId, generateTitle]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      if (messagesRef.current.length > 0) {
        saveMessages(conversationId, messagesRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts ?? []) {
        if (part.type !== "text") continue;

        const { artifacts } = parseArtifacts(part.text);
        for (const artifact of artifacts) {
          if (savedArtifactsRef.current.has(artifact.id)) continue;

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
    }
  }, [messages, conversationId, createArtifact, onArtifactCreated]);

  const handleChatModeChange = useCallback(
    (mode: ChatMode) => {
      setOptimisticMode({ conversationId, mode });
      updateChatMode({ id: conversationId, chatMode: mode });
    },
    [conversationId, updateChatMode],
  );

  const fileToUIPart = async (file: File): Promise<FileUIPart> => {
    const [part] = await filesToUIParts([file]);
    return part;
  };

  const sendPreparedMessage = useCallback(
    async (
      text: string,
      fileParts: FileUIPart[] = [],
      mode: ChatMode = chatMode,
    ) => {
      if (!text.trim() && fileParts.length === 0) return;

      await sendMessage(
        fileParts.length > 0 ? { text, files: fileParts } : { text },
        { body: { chatMode: mode } },
      );
    },
    [chatMode, sendMessage],
  );

  const handleSend = async (files: File[] = []) => {
    if (!input.trim() && files.length === 0) return;
    let text = input.trim();

    if (selectedElement) {
      text = `[User selected element: <${selectedElement.tagName}> with selector "${selectedElement.selector}" containing text "${selectedElement.textContent.slice(0, 60)}"]\n\n${text}`;
      onElementUsed?.();
    }

    if (!text && files.length > 0) {
      text = "Use the attached image as context.";
    }

    const fileParts = await Promise.all(files.map(fileToUIPart));

    setInput("");
    await sendPreparedMessage(text, fileParts);
  };

  const isLoading = status === "streaming" || status === "submitted";
  const initialMessageSentRef = useRef(false);

  useEffect(() => {
    if (initialMessageSentRef.current) return;
    if (loadedMessages === undefined || messages.length > 0) return;

    const initialMessage = takeInitialChatMessage(conversationId);
    if (!initialMessage) return;

    initialMessageSentRef.current = true;
    void sendPreparedMessage(
      initialMessage.text,
      initialMessage.files,
      initialMessage.chatMode,
    );
  }, [conversationId, loadedMessages, messages.length, sendPreparedMessage]);

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isLight ? "bg-[#f8f7f4] text-zinc-950" : "bg-black"
      }`}
    >
      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-5 py-8">
          <div className="w-full max-w-4xl">
            <div className="mb-8 text-center">
              <h1
                className={`text-4xl font-semibold tracking-normal sm:text-5xl ${
                  isLight ? "text-zinc-950" : "text-white"
                }`}
              >
                What will you build today?
              </h1>
              <p
                className={`mt-3 text-base sm:text-lg ${
                  isLight ? "text-zinc-500" : "text-zinc-400"
                }`}
              >
                Create a business by chatting with AI.
              </p>
            </div>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              onStop={stop}
              isLoading={isLoading}
              disabled={!userId}
              chatMode={chatMode}
              onChatModeChange={handleChatModeChange}
              variant="hero"
              appearance={appearance}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-4 py-5">
            <div className="mx-auto max-w-3xl space-y-4">
              {messages.map((m) => {
                const hasAssistantContent =
                  m.role === "assistant" && hasVisibleAssistantContent(m);

                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                        isLight
                          ? m.role === "user"
                            ? "bg-[#ebe9e4] text-zinc-950"
                            : "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200/70"
                          : m.role === "user"
                            ? "bg-white text-black"
                            : "bg-zinc-800 text-zinc-100"
                      }`}
                    >
                      {m.parts?.map((part, i) => {
                        if (part.type === "text") {
                          const {
                            cleanText,
                            artifacts,
                            isStreaming,
                            streamingTitle,
                            streamingFiles,
                          } = parseArtifacts(part.text);
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
                                            : "text-blue-500"
                                        }`}
                                      >
                                        {seg}
                                      </a>
                                    ) : (
                                      seg
                                    ),
                                  )}
                              </span>
                              {artifacts.map((a) => (
                                <ArtifactBadge key={a.id} title={a.title} />
                              ))}
                              {isStreaming && (
                                <div className="my-2">
                                  <AgentPlan
                                    tasks={[
                                      {
                                        id: "build",
                                        title: streamingTitle || "Building project",
                                        description: "Generating your application",
                                        status: "in-progress",
                                        priority: "high",
                                        level: 0,
                                        dependencies: [],
                                        subtasks: streamingFiles.map((f, fi) => ({
                                          id: `file-${fi}`,
                                          title: f,
                                          description: `Writing ${f}`,
                                          status: "completed",
                                          priority: "medium",
                                        })),
                                      },
                                    ]}
                                  />
                                </div>
                              )}
                            </span>
                          );
                        }
                        if (part.type === "file") {
                          const isImage = part.mediaType.startsWith("image/");
                          if (!isImage) return null;

                          return (
                            <img
                              key={i}
                              src={part.url}
                              alt={part.filename ?? "Attached image"}
                              className={`mb-2 max-h-64 rounded-lg border object-contain ${
                                isLight ? "border-zinc-200" : "border-zinc-700"
                              }`}
                            />
                          );
                        }
                        if (isToolUIPart(part)) {
                          return (
                            <ToolCallDisplay
                              key={i}
                              state={
                                part.state === "output-available" ? "result" : "call"
                              }
                              hideWhenComplete={hasAssistantContent}
                            />
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                );
              })}

              {isLoading && messages[messages.length - 1]?.role === "user" && (
                <div className="flex gap-3">
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      isLight
                        ? "bg-white text-zinc-500 shadow-sm ring-1 ring-zinc-200/70"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    Thinking...
                  </div>
                </div>
              )}

              {error &&
                (error.message?.includes("no_credits") || error.message?.includes("402") ? (
                  <div className="rounded-lg border border-yellow-700/40 bg-yellow-100 px-4 py-3 text-sm text-yellow-900">
                    <p className="font-medium">Out of credits</p>
                    <p className="mt-1 text-yellow-800/80">
                      You&apos;ve used all your available credits.
                    </p>
                    <a
                      href="/chat/billing"
                      className="mt-2 inline-block rounded bg-black px-3 py-1.5 text-xs font-medium text-white"
                    >
                      View Plans & Top Up
                    </a>
                  </div>
                ) : (
                  <div
                    className={`rounded-lg border px-4 py-3 text-sm ${
                      isLight
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-red-800 bg-red-900/20 text-red-400"
                    }`}
                  >
                    Error: {error.message}
                  </div>
                ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {selectedElement && (
            <div
              className={`mx-4 mb-1 flex items-center gap-2 rounded px-3 py-1.5 text-xs ${
                isLight
                  ? "bg-blue-50 text-blue-700"
                  : "bg-blue-900/30 text-blue-300"
              }`}
            >
              <span className="font-medium">Selected:</span>
              <code className="truncate">{selectedElement.selector}</code>
              <button
                onClick={onElementUsed}
                className={`ml-auto ${isLight ? "text-blue-600" : "text-blue-400 hover:text-white"}`}
              >
                &times;
              </button>
            </div>
          )}
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            onStop={stop}
            isLoading={isLoading}
            disabled={!userId}
            chatMode={chatMode}
            onChatModeChange={handleChatModeChange}
            appearance={appearance}
          />
        </>
      )}
    </div>
  );
}
