"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { ChatInput } from "@/components/ChatInput";
import { useAuth } from "@/providers/AuthProvider";
import {
  DEFAULT_MODEL_SELECTION,
  readRuntimeProviderBaseURL,
  readRuntimeProviderKey,
  type ModelSelection,
} from "@/lib/ai/models";

type Message = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "cryzo-marketing-model-v1";
const HISTORY_KEY = "cryzo-marketing-chat-v3";

export default function MarketingAIChat({
  channels,
  onCalendarChanged,
}: {
  channels: string[];
  onCalendarChanged?: () => void;
}) {
  const { authToken } = useAuth();
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState<ModelSelection>(DEFAULT_MODEL_SELECTION);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const model = localStorage.getItem(STORAGE_KEY);
      if (model) setSelection({ ...DEFAULT_MODEL_SELECTION, ...JSON.parse(model) });
      const history = localStorage.getItem(HISTORY_KEY);
      if (history) setMessages((JSON.parse(history) as Message[]).slice(-40));
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); } catch {}
  }, [selection]);

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40))); } catch {}
  }, [messages]);

  const history = useMemo(() => messages.slice(-16), [messages]);

  async function submit(files: File[]) {
    const prompt = input.trim() || (files.length ? "Use the attached image as context." : "");
    if (!prompt || !authToken || loading) return;
    setInput("");
    setLoading(true);
    setError("");
    setMessages((current) => [...current, { role: "user", content: prompt }]);
    try {
      const media: Array<{ url: string; name: string; contentType: string }> = [];
      for (const file of files) {
        const authorize = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const uploaded = await fetch(permission.uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploaded.ok) throw new Error("Upload failed.");
        const { storageId } = await uploaded.json();
        const register = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storageId, contentType: file.type, name: file.name }),
        });
        const record = await register.json();
        if (!register.ok) throw new Error(record.error || "Upload registration failed.");
        media.push({ url: String(record.url), name: file.name, contentType: file.type });
      }

      const response = await fetch("/api/social/draft", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          channels,
          history,
          media,
          modelProvider: selection.providerId,
          modelId: selection.modelId,
          modelCredentialMode: selection.credentialMode,
          reasoningEffort: selection.reasoningEffort || "default",
          modelBaseUrl: readRuntimeProviderBaseURL(selection.providerId) || selection.baseURL,
          modelApiKey: selection.credentialMode === "device"
            ? readRuntimeProviderKey(selection.providerId)
            : undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "no_message_credits") throw new Error("You need more message credits for this model.");
        throw new Error(data.message || data.error || "Marketing chat failed.");
      }
      const text = String(data.text || "Done.");
      setMessages((current) => [...current, { role: "assistant", content: text }].slice(-40));
      if (data.actionExecuted) onCalendarChanged?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Marketing chat failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="border-b border-zinc-800 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Sparkles size={16} />
          Cryzo Marketing AI
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Use the same Cryzo models and reasoning controls to draft, schedule, move, publish, and inspect your marketing calendar.
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 ? (
            <div className="py-16 text-center">
              <Sparkles className="mx-auto text-zinc-700" size={28} />
              <p className="mt-3 text-sm font-medium text-zinc-300">Operate your calendar with chat</p>
              <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-zinc-600">
                Try “schedule three X posts next week”, “move Friday’s post to 2 PM”, or “draft a launch announcement for LinkedIn”.
              </p>
            </div>
          ) : messages.map((message, index) => (
            <div key={index} className={message.role === "user" ? "flex justify-end" : ""}>
              <div className={message.role === "user"
                ? "max-w-[85%] rounded-2xl bg-zinc-800 px-4 py-3 text-sm leading-6 text-white"
                : "max-w-3xl whitespace-pre-wrap text-sm leading-7 text-zinc-200"}>
                {message.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 size={14} className="animate-spin" /> Working…
            </div>
          )}
          {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>}
        </div>
      </div>

      <ChatInput
        value={input}
        onChange={setInput}
        onSubmit={submit}
        onStop={() => {}}
        isLoading={loading}
        disabled={!authToken}
        chatMode="plan"
        onChatModeChange={() => {}}
        modelSelection={selection}
        onModelSelectionChange={setSelection}
        showModeMenu={false}
        placeholder="Ask Cryzo Marketing…"
      />
    </div>
  );
}
