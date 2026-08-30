"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { ChatInput, type ChatMode } from "@/components/ChatInput";
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
  const router = useRouter();
  const pendingHandled = useRef(false);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [modelSelection, setModelSelection] = useState<ModelSelection>(
    DEFAULT_MODEL_SELECTION,
  );
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
    <div className="flex h-full items-center justify-center overflow-y-auto px-5 py-8">
      <div className="w-full max-w-4xl py-4">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            What will you build today?
          </h1>
          <p className="mt-3 text-base text-zinc-400 sm:text-lg">
            Build for the web or create one Expo app for iOS and Android.
          </p>
        </div>
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
        <p className="mx-auto mt-3 max-w-xl text-center text-[11px] leading-5 text-zinc-600">
          If you do not touch the platform buttons, Cryzo can infer iOS, Android, mobile, or web from your prompt.
        </p>
      </div>
    </div>
  );
}
