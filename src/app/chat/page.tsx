"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Clock3 } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { ChatInput, type ChatMode } from "@/components/ChatInput";
import { ProjectImport } from "@/components/ProjectImport";
import {
  filesToUIParts,
  saveInitialChatMessage,
  takePendingAuthChatMessage,
} from "@/lib/chat/initial-message";
import {
  DEFAULT_MODEL_SELECTION,
  type ModelSelection,
} from "@/lib/ai/models";
import {
  DEFAULT_PROJECT_PLATFORMS,
  inferProjectPlatforms,
  normalizeProjectPlatforms,
  type ProjectPlatform,
} from "@/lib/project-platform";

export default function ChatEmptyPage() {
  const { userId } = useAuth();
  const createConversation = useMutation(api.conversations.create);
  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip",
  );
  const router = useRouter();
  const pendingHandled = useRef(false);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [modelSelection, setModelSelection] =
    useState<ModelSelection>(DEFAULT_MODEL_SELECTION);
  const [projectPlatforms, setProjectPlatforms] = useState<ProjectPlatform[]>(
    DEFAULT_PROJECT_PLATFORMS,
  );
  const [platformTouched, setPlatformTouched] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (!userId || pendingHandled.current) return;
    pendingHandled.current = true;
    const pending = takePendingAuthChatMessage();
    if (!pending) return;
    void (async () => {
      setIsStarting(true);
      try {
        const platforms = normalizeProjectPlatforms(pending.projectPlatforms);
        const id = await createConversation({
          userId,
          chatMode: pending.chatMode,
          projectPlatforms: platforms,
          modelProvider: DEFAULT_MODEL_SELECTION.providerId,
          modelId: DEFAULT_MODEL_SELECTION.modelId,
          modelCredentialMode: DEFAULT_MODEL_SELECTION.credentialMode,
        });
        saveInitialChatMessage({
          conversationId: id,
          text: pending.text,
          chatMode: pending.chatMode,
          files: pending.files,
        });
        router.replace(`/chat/${id}`);
      } finally {
        setIsStarting(false);
      }
    })();
  }, [createConversation, router, userId]);

  const handleSubmit = async (files: File[] = []) => {
    if (!userId || isStarting) return;
    setIsStarting(true);
    try {
      const text = input.trim();
      const messageText = text || "Use the attached image as context.";
      const fileParts = await filesToUIParts(files);
      const resolvedPlatforms = inferProjectPlatforms(
        messageText,
        projectPlatforms,
        platformTouched,
      );
      const id = await createConversation({
        userId,
        chatMode,
        projectPlatforms: resolvedPlatforms,
        modelProvider: modelSelection.providerId,
        modelId: modelSelection.modelId,
        modelCredentialMode: modelSelection.credentialMode,
        modelBaseUrl: modelSelection.baseURL,
      });
      saveInitialChatMessage({
        conversationId: id,
        text: messageText,
        chatMode,
        files: fileParts,
      });
      setInput("");
      router.push(`/chat/${id}`);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-black px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center py-10">
        <section className="mx-auto w-full max-w-4xl">
          <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-6xl">
            What will you build today?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-zinc-500 sm:text-base">
            Create an app by chatting with AI.
          </p>

          <div className="mt-8">
            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={() => setIsStarting(false)}
              isLoading={isStarting}
              disabled={!userId}
              chatMode={chatMode}
              onChatModeChange={setChatMode}
              modelSelection={modelSelection}
              onModelSelectionChange={setModelSelection}
              projectPlatforms={projectPlatforms}
              onProjectPlatformsChange={(platforms) => {
                setProjectPlatforms(platforms);
                setPlatformTouched(true);
              }}
              variant="hero"
            />
            {userId && (
              <ProjectImport userId={userId} modelSelection={modelSelection} />
            )}
          </div>
        </section>

        {(conversations?.length || 0) > 0 && (
          <section className="mx-auto mt-14 w-full max-w-5xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-zinc-300">Recent projects</h2>
              <span className="text-xs text-zinc-600">
                {conversations?.length || 0} total
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(conversations || []).slice(0, 6).map((conversation) => (
                <Link
                  key={conversation._id}
                  href={`/chat/${conversation._id}`}
                  className="group rounded-2xl border border-zinc-900 bg-[#0c0c0c] p-4 transition hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between">
                    <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
                    <ArrowUpRight
                      size={14}
                      className="text-zinc-700 group-hover:text-white"
                    />
                  </div>
                  <h3 className="mt-4 truncate text-sm font-medium text-zinc-200">
                    {conversation.title}
                  </h3>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-600">
                    <Clock3 size={11} /> Updated{" "}
                    {new Date(conversation.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
