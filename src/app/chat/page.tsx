"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import { ChatInput, type ChatMode } from "@/components/ChatInput";
import {
  filesToUIParts,
  saveInitialChatMessage,
} from "@/lib/chat/initial-message";
import {
  DEFAULT_MODEL_SELECTION,
  type ModelSelection,
} from "@/lib/ai/models";

export default function ChatEmptyPage() {
  const { userId } = useAuth();
  const createConversation = useMutation(api.conversations.create);
  const router = useRouter();
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [modelSelection, setModelSelection] = useState<ModelSelection>(
    DEFAULT_MODEL_SELECTION,
  );
  const [isStarting, setIsStarting] = useState(false);

  const handleSubmit = async (files: File[] = []) => {
    if (!userId || isStarting) return;

    setIsStarting(true);
    try {
      const text = input.trim();
      const fileParts = await filesToUIParts(files);
      const id = await createConversation({
        userId: userId,
        chatMode,
        modelProvider: modelSelection.providerId,
        modelId: modelSelection.modelId,
        modelCredentialMode: modelSelection.credentialMode,
        modelBaseUrl: modelSelection.baseURL,
      });

      saveInitialChatMessage({
        conversationId: id,
        text: text || "Use the attached image as context.",
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
    <div className="flex h-full items-center justify-center px-5 py-8">
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-5xl">
            What will you build today?
          </h1>
          <p className="mt-3 text-base text-zinc-400 sm:text-lg">
            Create a business by chatting with AI.
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
          variant="hero"
        />
      </div>
    </div>
  );
}
