"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { useAuthToken } from "@convex-dev/auth/react";
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
  finishStreamingArtifactStream,
  getCompletedStreamingActions,
  processStreamingArtifactText,
} from "@/lib/workspace/streaming-runtime";
import {
  filesToUIParts,
  takeInitialChatMessage,
} from "@/lib/chat/initial-message";
import {
  DEFAULT_MODEL_SELECTION,
  getProvider,
  readRuntimeProviderBaseURL,
  readRuntimeProviderKey,
  type ModelSelection,
} from "@/lib/ai/models";
import { buildLocalSystemPrompt } from "@/lib/ai/local-prompt";
import { normalizeManagedModelId } from "@/lib/ai/managed-models";
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

function textFromMessage(message: UIMessage) {
  return (
    message.parts
      ?.filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n") || ""
  );
}

function localMessageId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random()}`;
}

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
  const { userId } = useAuth();
  const authToken = useAuthToken();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const localAbortRef = useRef<AbortController | null>(null);
  const [input, setInput] = useState("");
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [optimisticMode, setOptimisticMode] = useState<{
    conversationId: string;
    mode: ChatMode;
  } | null>(null);
  const [optimisticModel, setOptimisticModel] = useState<{
    conversationId: string;
    selection: ModelSelection;
  } | null>(null);

  const { conversation, loadedMessages, saveMessages, generateTitle } =
    useChatHistory(userId, conversationId);
  const createArtifact = useMutation(api.artifacts.create);
  const updateChatMode = useMutation(api.conversations.updateChatMode);
  const updateModel = useMutation(api.conversations.updateModel);
  const savedArtifactsRef = useRef<Set<string>>(new Set());
  const liveMessageIdsRef = useRef<Set<string>>(new Set());
  const openedStreamingMessagesRef = useRef<Set<string>>(new Set());

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

  const savedProviderId =
    conversation?.modelProvider || DEFAULT_MODEL_SELECTION.providerId;
  const savedModelId = conversation?.modelId || DEFAULT_MODEL_SELECTION.modelId;
  const modelSelection: ModelSelection =
    optimisticModel?.conversationId === conversationId
      ? optimisticModel.selection
      : {
          providerId: savedProviderId,
          modelId:
            savedProviderId === "cryzo"
              ? normalizeManagedModelId(savedModelId)
              : savedModelId,
          credentialMode:
            conversation?.modelCredentialMode || DEFAULT_MODEL_SELECTION.credentialMode,
          baseURL: conversation?.modelBaseUrl,
        };

  const prevConvIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  useEffect(() => {
    if (conversationId !== prevConvIdRef.current) {
      prevConvIdRef.current = conversationId;
      loadedRef.current = false;
      savedArtifactsRef.current = new Set();
      liveMessageIdsRef.current = new Set();
      openedStreamingMessagesRef.current = new Set();
      localAbortRef.current?.abort();
      setLocalLoading(false);
      setLocalError(null);
      setOptimisticModel(null);
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
          const text = textFromMessage(lastAssistant);
          if (text) generateTitle(conversationId, text);
        }
      }
    }
    prevStatusRef.current = status;
  }, [status, debouncedSave, conversation?.title, conversationId, generateTitle]);

  useEffect(() => {
    return () => {
      localAbortRef.current?.abort();
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

  // Feed the currently-generated assistant message directly into the browser
  // runtime. This intentionally bypasses the Convex persistence round-trip for
  // live preview; Convex still stores the completed artifact below.
  useEffect(() => {
    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!latestAssistant) return;

    if (status === "streaming" || status === "submitted" || localLoading) {
      liveMessageIdsRef.current.add(latestAssistant.id);
    }

    if (!liveMessageIdsRef.current.has(latestAssistant.id)) return;

    let hasStreamingArtifact = false;
    for (const part of latestAssistant.parts ?? []) {
      if (part.type !== "text") continue;
      if (
        processStreamingArtifactText(
          String(conversationId),
          latestAssistant.id,
          part.text,
        )
      ) {
        hasStreamingArtifact = true;
      }
    }

    if (
      hasStreamingArtifact &&
      !openedStreamingMessagesRef.current.has(latestAssistant.id)
    ) {
      openedStreamingMessagesRef.current.add(latestAssistant.id);
      onArtifactCreated?.();
    }
  }, [messages, status, localLoading, conversationId, onArtifactCreated]);

  const runtimeStatusRef = useRef(status);
  useEffect(() => {
    const previous = runtimeStatusRef.current;
    runtimeStatusRef.current = status;
    const generationEnded =
      (previous === "streaming" || previous === "submitted") &&
      (status === "ready" || status === "error");
    if (!generationEnded) return;

    const latestAssistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!latestAssistant || !liveMessageIdsRef.current.has(latestAssistant.id)) return;

    finishStreamingArtifactStream(
      String(conversationId),
      latestAssistant.id,
      status === "error" ? error?.message : undefined,
    );
  }, [conversationId, error?.message, messages, status]);

  // Persist completed artifacts and per-file checkpoints. Database writes stay
  // outside the execution queue so they never delay the live preview.
  useEffect(() => {
    for (const message of messages) {
      if (message.role !== "assistant") continue;

      for (const part of message.parts ?? []) {
        if (part.type !== "text") continue;

        const { artifacts } = parseArtifacts(part.text);
        for (const artifact of artifacts) {
          if (savedArtifactsRef.current.has(artifact.id)) continue;

          savedArtifactsRef.current.add(artifact.id);
          void createArtifact({
            conversationId,
            artifactId: artifact.id,
            title: artifact.title,
            actions: artifact.actions,
          });
          onArtifactCreated?.();
        }

        if (artifacts.length === 0) {
          const checkpoints = getCompletedStreamingActions(part.text);
          checkpoints.forEach((action, index) => {
            const checkpointId = `${message.id}-checkpoint-${index}`;
            if (savedArtifactsRef.current.has(checkpointId)) return;

            savedArtifactsRef.current.add(checkpointId);
            void createArtifact({
              conversationId,
              artifactId: checkpointId,
              title: "Build checkpoint",
              actions: [action],
            });
          });
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

  const handleModelSelectionChange = useCallback(
    (selection: ModelSelection) => {
      setOptimisticModel({ conversationId, selection });
      updateModel({
        id: conversationId,
        providerId: selection.providerId,
        modelId: selection.modelId,
        credentialMode: selection.credentialMode,
        baseUrl: selection.baseURL,
      });
    },
    [conversationId, updateModel],
  );

  const fileToUIPart = async (file: File): Promise<FileUIPart> => {
    const [part] = await filesToUIParts([file]);
    return part;
  };

  const runLocalModel = useCallback(
    async (
      text: string,
      fileParts: FileUIPart[],
      mode: ChatMode,
      selection: ModelSelection,
    ) => {
      const provider = getProvider(selection.providerId);
      const baseURL = (
        readRuntimeProviderBaseURL(selection.providerId) ||
        selection.baseURL ||
        provider.defaultBaseURL ||
        ""
      ).replace(/\/$/, "");
      if (!baseURL) throw new Error("Local model base URL is missing");

      const apiKey = readRuntimeProviderKey(selection.providerId);
      const controller = new AbortController();
      localAbortRef.current = controller;
      setLocalLoading(true);
      setLocalError(null);

      const userMessage: UIMessage = {
        id: localMessageId("user"),
        role: "user",
        parts: [
          { type: "text", text },
          ...fileParts,
        ],
      };
      const assistantId = localMessageId("assistant");
      const assistantMessage: UIMessage = {
        id: assistantId,
        role: "assistant",
        parts: [{ type: "text", text: "" }],
      };
      liveMessageIdsRef.current.add(assistantId);

      const history = messagesRef.current
        .filter((message) => message.role === "user" || message.role === "assistant")
        .map((message) => ({
          role: message.role,
          content: textFromMessage(message),
        }))
        .filter((message) => message.content.trim());

      const imageParts = fileParts
        .filter((part) => part.mediaType?.startsWith("image/"))
        .map((part) => ({
          type: "image_url",
          image_url: { url: part.url },
        }));
      const localUserContent = imageParts.length
        ? [{ type: "text", text }, ...imageParts]
        : text;

      let nextMessages = [...messagesRef.current, userMessage, assistantMessage];
      messagesRef.current = nextMessages;
      setMessages(nextMessages);

      try {
        const response = await fetch(`${baseURL}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({
            model: selection.modelId,
            stream: true,
            messages: [
              { role: "system", content: buildLocalSystemPrompt(mode) },
              ...history,
              { role: "user", content: localUserContent },
            ],
          }),
        });
        if (!response.ok) {
          const detail = await response.text();
          throw new Error(detail || `Local model returned HTTP ${response.status}`);
        }
        if (!response.body) throw new Error("Local model returned no response body");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantText = "";

        const updateAssistant = (content: string) => {
          nextMessages = nextMessages.map((message) =>
            message.id === assistantId
              ? { ...message, parts: [{ type: "text" as const, text: content }] }
              : message,
          );
          messagesRef.current = nextMessages;
          setMessages(nextMessages);
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line || !line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const parsed = JSON.parse(payload);
              const delta =
                parsed.choices?.[0]?.delta?.content ??
                parsed.choices?.[0]?.message?.content ??
                "";
              if (typeof delta === "string" && delta) {
                assistantText += delta;
                updateAssistant(assistantText);
              }
            } catch {
              // Some local servers emit keepalive/non-JSON SSE frames.
            }
          }
        }

        if (!assistantText && buffer.trim()) {
          try {
            const parsed = JSON.parse(buffer.replace(/^data:\s*/, ""));
            assistantText = parsed.choices?.[0]?.message?.content || "";
            if (assistantText) updateAssistant(assistantText);
          } catch {}
        }

        debouncedSave();
        if (conversation?.title === "New Chat" && assistantText) {
          generateTitle(conversationId, assistantText);
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setLocalError(error instanceof Error ? error.message : "Local model request failed");
        }
      } finally {
        localAbortRef.current = null;
        setLocalLoading(false);
      }
    },
    [conversation?.title, conversationId, debouncedSave, generateTitle, setMessages],
  );

  const sendPreparedMessage = useCallback(
    async (
      text: string,
      fileParts: FileUIPart[] = [],
      mode: ChatMode = chatMode,
    ) => {
      if (!text.trim() && fileParts.length === 0) return;

      const selection = modelSelection;
      const provider = getProvider(selection.providerId);
      if (provider.local) {
        await runLocalModel(text, fileParts, mode, selection);
        return;
      }

      const modelApiKey =
        selection.credentialMode === "device"
          ? readRuntimeProviderKey(selection.providerId)
          : undefined;
      const modelBaseUrl =
        readRuntimeProviderBaseURL(selection.providerId) || selection.baseURL;

      await sendMessage(
        fileParts.length > 0 ? { text, files: fileParts } : { text },
        {
          body: {
            chatMode: mode,
            modelProvider: selection.providerId,
            modelId: selection.modelId,
            modelCredentialMode: selection.credentialMode,
            modelBaseUrl,
            modelApiKey,
            authToken: selection.credentialMode === "account" ? authToken : undefined,
          },
        },
      );
    },
    [authToken, chatMode, modelSelection, runLocalModel, sendMessage],
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

  const isLoading =
    status === "streaming" || status === "submitted" || localLoading;
  const errorText = localError || error?.message || "";
  const isCreditError = /no_(message_)?credits|402/i.test(errorText);
  const initialMessageSentRef = useRef(false);

  const stopAll = useCallback(() => {
    localAbortRef.current?.abort();
    setLocalLoading(false);
    stop();
  }, [stop]);

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
    <div className="flex h-full min-h-0 flex-col bg-black">
      {messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-5 sm:py-8">
          <div className="w-full max-w-4xl">
            <div className="mb-7 text-center sm:mb-8">
              <h1 className="text-3xl font-semibold tracking-normal text-white sm:text-5xl">
                What will you build today?
              </h1>
              <p className="mt-3 text-sm text-zinc-400 sm:text-lg">
                Create a business by chatting with AI.
              </p>
            </div>
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSend}
              onStop={stopAll}
              isLoading={isLoading}
              disabled={!userId}
              chatMode={chatMode}
              onChatModeChange={handleChatModeChange}
              modelSelection={modelSelection}
              onModelSelectionChange={handleModelSelectionChange}
              variant="hero"
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:p-6">
            <div className="mx-auto max-w-3xl space-y-5 sm:space-y-4">
              {messages.map((m) => {
                const hasAssistantContent =
                  m.role === "assistant" && hasVisibleAssistantContent(m);

                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}
                  >
                    <div
                      className={`text-[15px] leading-7 sm:max-w-[80%] sm:rounded-lg sm:px-4 sm:py-3 sm:text-sm sm:leading-normal ${
                        m.role === "user"
                          ? "max-w-[88%] rounded-2xl bg-zinc-800 px-4 py-2.5 text-white sm:bg-white sm:text-black"
                          : "w-full max-w-full bg-transparent px-0 py-1 text-zinc-100 sm:w-auto sm:bg-zinc-800"
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
                                            ? "text-blue-300 sm:text-blue-600"
                                            : "text-blue-400"
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
                                <div className="my-3 sm:my-2">
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
                              className="mb-2 max-h-64 rounded-xl border border-zinc-700 object-contain"
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
                  <div className="py-1 text-[15px] leading-7 text-zinc-400 sm:rounded-lg sm:bg-zinc-800 sm:px-4 sm:py-3 sm:text-sm sm:leading-normal">
                    Thinking...
                  </div>
                </div>
              )}

              {(error || localError) &&
                (isCreditError ? (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
                    <div role="dialog" aria-modal="true" aria-labelledby="credit-limit-title" className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-950 p-6 shadow-2xl">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Monthly plans</p>
                      <h2 id="credit-limit-title" className="mt-2 text-2xl font-semibold text-white">Keep building with Cryzo</h2>
                      <p className="mt-2 text-sm leading-6 text-zinc-400">
                        Your included managed-model credits are used up. BYOK remains free, or upgrade for more monthly capacity.
                      </p>
                      <div className="mt-5 grid gap-3 sm:grid-cols-2">
                        <a href="/chat/billing?cycle=monthly" className="rounded-xl border border-zinc-700 bg-black p-4 transition hover:border-zinc-500">
                          <span className="text-sm font-semibold text-white">Starter</span>
                          <span className="mt-1 block text-2xl font-semibold text-white">$20<span className="text-sm font-normal text-zinc-500">/month</span></span>
                          <span className="mt-2 block text-xs leading-5 text-zinc-400">100 message credits and 2,000 integration credits.</span>
                        </a>
                        <a href="/chat/billing?cycle=monthly" className="rounded-xl border border-zinc-700 bg-white p-4 text-black transition hover:bg-zinc-200">
                          <span className="text-sm font-semibold">View all plans</span>
                          <span className="mt-1 block text-2xl font-semibold">Monthly billing</span>
                          <span className="mt-2 block text-xs leading-5 text-zinc-600">Compare capacity or add a message-credit top-up.</span>
                        </a>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-800 bg-red-900/20 px-4 py-3 text-sm text-red-300">
                    <p>Error: {localError || error?.message}</p>
                    <button
                      type="button"
                      onClick={() =>
                        void sendPreparedMessage(
                          "Continue the interrupted build from the latest saved project files. Finish any missing files, preserve completed work, install dependencies if needed, and start the preview.",
                        )
                      }
                      disabled={isLoading}
                      className="mt-3 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                    >
                      Continue build
                    </button>
                  </div>
                ))}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {selectedElement && (
            <div className="mx-3 mb-1 flex items-center gap-2 rounded-lg bg-blue-900/30 px-3 py-1.5 text-xs text-blue-300 sm:mx-4">
              <span className="font-medium">Selected:</span>
              <code className="truncate">{selectedElement.selector}</code>
              <button
                type="button"
                onClick={onElementUsed}
                className="ml-auto text-blue-400 hover:text-white"
              >
                &times;
              </button>
            </div>
          )}
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            onStop={stopAll}
            isLoading={isLoading}
            disabled={!userId}
            chatMode={chatMode}
            onChatModeChange={handleChatModeChange}
            modelSelection={modelSelection}
            onModelSelectionChange={handleModelSelectionChange}
          />
        </>
      )}
    </div>
  );
}
