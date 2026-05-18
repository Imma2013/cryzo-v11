"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { ChatInput, type ChatMode } from "@/components/ChatInput";
import { useAuth } from "@/providers/AuthProvider";
import {
  filesToUIParts,
  saveInitialChatMessage,
  savePendingAuthChatMessage,
} from "@/lib/chat/initial-message";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, userId, isLoading: loading } = useAuth();
  const createConversation = useMutation(api.conversations.create);
  const [input, setInput] = useState("");
  const [chatMode, setChatMode] = useState<ChatMode>("build");
  const [isStarting, setIsStarting] = useState(false);
  const [authSettled, setAuthSettled] = useState(false);

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setAuthSettled(true), 150);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.replace("/chat");
    }
  }, [loading, isAuthenticated, router]);

  if (loading || isAuthenticated || !authSettled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  const handleSubmit = async (files: File[] = []) => {
    if (isStarting || loading) return;

    const text = input.trim();
    if (!text && files.length === 0) return;

    setIsStarting(true);
    try {
      const fileParts = await filesToUIParts(files);
      const messageText = text || "Use the attached image as context.";

      if (!isAuthenticated || !userId) {
        savePendingAuthChatMessage({
          text: messageText,
          chatMode,
          files: fileParts,
        });
        router.push("/login?next=/chat");
        return;
      }

      const id = await createConversation({
        userId,
        chatMode,
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
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,_rgba(39,39,42,0.84),_rgba(0,0,0,0)_36%),linear-gradient(90deg,_rgba(59,130,246,0.10),_rgba(24,24,27,0)_42%,_rgba(20,184,166,0.08))]" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="flex items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-black">
              C
            </span>
            <span>Cryzo</span>
          </Link>
          <Link
            href={isAuthenticated ? "/chat" : "/login?next=/chat"}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 text-sm font-medium text-white transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            {isAuthenticated ? "Go to app" : "Sign in"}
            <ArrowRight size={15} />
          </Link>
        </header>

        <section className="flex flex-1 items-center px-5 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mx-auto mb-8 max-w-3xl text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-400">
                <Sparkles size={14} className="text-blue-300" />
                Create a business by chatting with AI
              </div>
              <h1 className="text-4xl font-semibold tracking-normal text-white sm:text-6xl">
                What will you build today?
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
                Start with an idea, image, or rough plan. Cryzo turns the
                conversation into an app workspace you can keep building from.
              </p>
            </div>

            <ChatInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              onStop={() => setIsStarting(false)}
              isLoading={isStarting}
              disabled={loading || (isAuthenticated && !userId)}
              chatMode={chatMode}
              onChatModeChange={setChatMode}
              variant="hero"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
