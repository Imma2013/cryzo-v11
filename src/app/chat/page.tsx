"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Clock3, Sparkles } from "lucide-react";
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
  const { user, userId } = useAuth();
  const createConversation = useMutation(api.conversations.create);
  const conversations = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip",
  );
  const router = useRouter();
  const pendingHandled = useRef(false);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [modelSelection, setModelSelection] = useState<ModelSelection>(DEFAULT_MODEL_SELECTION);
  const [projectPlatforms, setProjectPlatforms] = useState<ProjectPlatform[]>(DEFAULT_PROJECT_PLATFORMS);
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
        saveInitialChatMessage({ conversationId: id, text: pending.text, chatMode: pending.chatMode, files: pending.files });
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
      const resolvedPlatforms = inferProjectPlatforms(messageText, projectPlatforms, platformTouched);
      const id = await createConversation({
        userId,
        chatMode,
        projectPlatforms: resolvedPlatforms,
        modelProvider: modelSelection.providerId,
        modelId: modelSelection.modelId,
        modelCredentialMode: modelSelection.credentialMode,
        modelBaseUrl: modelSelection.baseURL,
      });
      saveInitialChatMessage({ conversationId: id, text: messageText, chatMode, files: fileParts });
      setInput("");
      router.push(`/chat/${id}`);
    } finally {
      setIsStarting(false);
    }
  };

  const firstName = (user?.name || user?.email || "there").split(/[ @]/)[0];

  return (
    <div className="h-full overflow-y-auto bg-[radial-gradient(circle_at_65%_18%,rgba(255,95,46,0.14),transparent_32%),#090909] px-5 py-8 text-white sm:px-8">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col justify-center py-8">
        <div className="mx-auto w-full max-w-4xl">
          <p className="mb-3 flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#ff7550]">
            <Sparkles size={14} /> Builder
          </p>
          <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-6xl">
            Hi {firstName}.<br />What will you build next?
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-sm leading-6 text-zinc-500 sm:text-base">
            Describe the product. Cryzo handles the code, cloud, preview, and deployment.
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
          </div>
        </div>

        <div className="mt-12 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Recent projects</h2>
              <span className="text-xs text-zinc-600">{conversations?.length || 0} total</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {(conversations || []).slice(0, 6).map((conversation) => (
                <Link key={conversation._id} href={`/chat/${conversation._id}`} className="group rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4 transition hover:-translate-y-0.5 hover:border-zinc-600">
                  <div className="flex items-center justify-between">
                    <img src="/icon.svg" alt="" className="h-9 w-9 rounded-xl" />
                    <ArrowUpRight size={15} className="text-zinc-700 group-hover:text-white" />
                  </div>
                  <h3 className="mt-5 truncate text-sm font-semibold">{conversation.title}</h3>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-zinc-600">
                    <Clock3 size={11} /> Updated {new Date(conversation.updatedAt).toLocaleDateString()}
                  </p>
                </Link>
              ))}
              {conversations?.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600 sm:col-span-2 xl:col-span-3">
                  Your first project will appear here.
                </div>
              )}
            </div>
          </section>
          <Link href="/chat/social" className="group rounded-2xl border border-[#ff5f2e]/30 bg-[#ff5f2e] p-5 text-white transition hover:-translate-y-0.5">
            <CalendarDays size={24} />
            <h2 className="mt-12 text-xl font-semibold">Plan your social week</h2>
            <p className="mt-2 text-sm leading-6 text-orange-100/80">Create, schedule, and publish to seven networks with Cryzo Social.</p>
            <span className="mt-5 inline-flex items-center gap-2 text-xs font-semibold">Open calendar <ArrowUpRight size={14} /></span>
          </Link>
        </div>
      </div>
    </div>
  );
}
