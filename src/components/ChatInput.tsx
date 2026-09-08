"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Globe2,
  Hammer,
  ImagePlus,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  Plus,
  Send,
  Smartphone,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModelPicker } from "@/components/ModelPicker";
import { McpQuickMenu } from "@/components/McpQuickMenu";
import {
  DEFAULT_MODEL_SELECTION,
  type ModelSelection,
} from "@/lib/ai/models";
import {
  toggleProjectPlatform,
  type ProjectPlatform,
} from "@/lib/project-platform";

export type ChatMode = "build" | "plan";

type ImageAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: {
    [index: number]: { transcript: string };
  };
};

type SpeechRecognitionEventLike = {
  results: SpeechRecognitionResultListLike;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type ChatPrefillDetail = {
  prompt?: string;
  notice?: string;
  forceBuildMode?: boolean;
};

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;

const MODES = [
  {
    id: "build" as const,
    label: "Build",
    description: "Make changes directly",
    icon: Hammer,
  },
  {
    id: "plan" as const,
    label: "Discuss",
    description: "Talk through ideas without editing code",
    icon: MessageCircle,
  },
];

function createAttachment(file: File): ImageAttachment {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${file.name}-${file.lastModified}-${Math.random()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  };
}

function validImageFiles(files: File[]) {
  return files.filter(
    (file) => file.type.startsWith("image/") && file.size <= MAX_ATTACHMENT_SIZE,
  );
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading,
  disabled,
  chatMode,
  onChatModeChange,
  modelSelection = DEFAULT_MODEL_SELECTION,
  onModelSelectionChange = () => {},
  projectPlatforms,
  onProjectPlatformsChange,
  variant = "dock",
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: File[]) => Promise<void> | void;
  onStop: () => void;
  isLoading: boolean;
  disabled: boolean;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
  modelSelection?: ModelSelection;
  onModelSelectionChange?: (selection: ModelSelection) => void;
  projectPlatforms?: ProjectPlatform[];
  onProjectPlatformsChange?: (platforms: ProjectPlatform[]) => void;
  variant?: "dock" | "hero";
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const attachmentsRef = useRef<ImageAttachment[]>([]);
  const valueRef = useRef(value);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const prefillTimerRef = useRef<number | null>(null);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const isHero = variant === "hero";
  const speechSupported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 176)}px`;
  }, [value]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const node = event.target as Node;
      if (!modeMenuRef.current?.contains(node)) setModeOpen(false);
      if (!plusMenuRef.current?.contains(node)) setPlusOpen(false);
    };
    document.addEventListener("pointerdown", closeMenus);
    return () => document.removeEventListener("pointerdown", closeMenus);
  }, []);

  useEffect(() => {
    const handlePrefill = (event: Event) => {
      const detail = (event as CustomEvent<ChatPrefillDetail>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt) return;
      onChange(prompt);
      if (detail.forceBuildMode && chatMode !== "build") onChatModeChange("build");
      setPrefillNotice(detail.notice || "Prompt added to chat");
      if (prefillTimerRef.current) window.clearTimeout(prefillTimerRef.current);
      prefillTimerRef.current = window.setTimeout(() => setPrefillNotice(null), 4500);
      window.setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(prompt.length, prompt.length);
      }, 0);
    };
    window.addEventListener("cryzo:prefill-chat", handlePrefill as EventListener);
    return () =>
      window.removeEventListener("cryzo:prefill-chat", handlePrefill as EventListener);
  }, [chatMode, onChange, onChatModeChange]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      if (prefillTimerRef.current) window.clearTimeout(prefillTimerRef.current);
      attachmentsRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      );
    };
  }, []);

  const addFiles = (files: File[]) => {
    const images = validImageFiles(files);
    setAttachmentError(
      images.length !== files.length ? "Only images up to 8MB can be attached." : null,
    );
    if (!images.length) return;
    const remaining = Math.max(0, MAX_ATTACHMENTS - attachments.length);
    const next = images.slice(0, remaining);
    if (next.length < images.length) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images.`);
    }
    setAttachments((current) => [...current, ...next.map(createAttachment)]);
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  };

  const clearAttachments = () => {
    setAttachments((current) => {
      current.forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      return [];
    });
  };

  const handleSubmit = async () => {
    if (isLoading) {
      onStop();
      return;
    }
    if (disabled || (!value.trim() && attachments.length === 0)) return;
    await onSubmit(attachments.map((attachment) => attachment.file));
    clearAttachments();
    setAttachmentError(null);
    setPrefillNotice(null);
  };

  const toggleListening = () => {
    if (!speechSupported || disabled || isLoading) return;
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index]?.[0]?.transcript || "",
      )
        .join(" ")
        .trim();
      if (!transcript) return;
      const current = valueRef.current.trim();
      onChange(current ? `${current} ${transcript}` : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const activeMode = MODES.find((mode) => mode.id === chatMode) || MODES[0];
  const ActiveModeIcon = activeMode.icon;
  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div
      className={cn(
        isHero
          ? "w-full"
          : "border-t border-zinc-900 bg-black px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 md:px-4 md:py-4",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full max-w-3xl overflow-visible rounded-2xl border bg-[#101010] shadow-[0_18px_50px_rgba(0,0,0,0.28)] transition",
          isHero ? "border-zinc-700" : "border-zinc-800",
          "focus-within:border-zinc-600",
          isDragging && "border-zinc-400 ring-1 ring-zinc-500/50",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative h-16 w-16 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900"
              >
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/80 p-1 text-white opacity-80 hover:opacity-100"
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {(attachmentError || prefillNotice) && (
          <div
            className={cn(
              "mx-3 mt-3 rounded-lg px-3 py-2 text-xs",
              attachmentError
                ? "bg-amber-500/10 text-amber-300"
                : "bg-emerald-500/10 text-emerald-300",
            )}
          >
            {attachmentError || `${prefillNotice}. Review and send when ready.`}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files).filter((file) =>
              file.type.startsWith("image/"),
            );
            if (files.length) {
              event.preventDefault();
              addFiles(files);
            }
          }}
          placeholder={
            chatMode === "plan"
              ? "Ask a question or plan your next change..."
              : isHero
                ? "Describe what you want to build..."
                : "What would you like to build?"
          }
          disabled={disabled}
          rows={1}
          className={cn(
            "block max-h-44 w-full resize-none bg-transparent px-4 pb-3 pt-4 text-[16px] leading-6 text-white outline-none placeholder:text-zinc-500 disabled:opacity-50 md:text-sm",
            isHero ? "min-h-[112px]" : "min-h-[78px]",
          )}
        />

        <div className="flex items-center gap-1.5 px-3 pb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) addFiles(Array.from(event.target.files));
              event.currentTarget.value = "";
            }}
          />

          <div ref={plusMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setPlusOpen((open) => !open)}
              disabled={disabled}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:opacity-40"
              title="Add or connect"
              aria-haspopup="menu"
              aria-expanded={plusOpen}
            >
              <Plus size={20} />
            </button>
            {plusOpen && (
              <div
                className={cn(
                  "absolute z-[70] w-72 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl",
                  isHero ? "left-0 top-full mt-2" : "bottom-full left-0 mb-2",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setPlusOpen(false);
                    fileInputRef.current?.click();
                  }}
                  disabled={attachments.length >= MAX_ATTACHMENTS}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                >
                  <ImagePlus size={16} className="text-zinc-400" />
                  Add image
                </button>
                <McpQuickMenu />
              </div>
            )}
          </div>

          <div ref={modeMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setModeOpen((open) => !open)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800"
              aria-haspopup="menu"
              aria-expanded={modeOpen}
            >
              <ActiveModeIcon size={14} />
              {activeMode.label}
              <ChevronDown size={12} />
            </button>
            {modeOpen && (
              <div
                className={cn(
                  "absolute z-50 w-64 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 p-1.5 shadow-2xl",
                  isHero ? "left-0 top-full mt-2" : "bottom-full left-0 mb-2",
                )}
              >
                {MODES.map((mode) => {
                  const Icon = mode.icon;
                  const selected = mode.id === chatMode;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        onChatModeChange(mode.id);
                        setModeOpen(false);
                      }}
                      className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-zinc-900"
                    >
                      <Icon size={16} className="mt-0.5 shrink-0 text-zinc-300" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-white">{mode.label}</span>
                        <span className="block text-xs text-zinc-500">{mode.description}</span>
                      </span>
                      {selected && <Check size={15} className="mt-0.5 text-white" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 overflow-hidden [&>button>span:nth-of-type(2)]:hidden">
            <ModelPicker
              selection={modelSelection}
              onChange={onModelSelectionChange}
              compact
            />
          </div>

          <button
            type="button"
            onClick={toggleListening}
            disabled={!speechSupported || disabled || isLoading}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-800 hover:text-white disabled:opacity-30",
              isListening && "bg-red-500/10 text-red-400",
            )}
            title={
              speechSupported
                ? isListening
                  ? "Stop voice input"
                  : "Start voice input"
                : "Voice input is not supported in this browser"
            }
          >
            {isListening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!isLoading && (disabled || !canSend)}
            className={cn(
              "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition",
              isLoading
                ? "bg-blue-600 text-white hover:bg-blue-500"
                : "bg-zinc-200 text-zinc-900 hover:bg-white disabled:cursor-not-allowed disabled:opacity-35",
            )}
            aria-label={isLoading ? "Stop generation" : "Send message"}
          >
            {isLoading ? <Square size={14} fill="currentColor" /> : <Send size={15} />}
          </button>
        </div>

        {isListening && (
          <div className="flex items-center gap-2 border-t border-zinc-900 px-4 py-2 text-xs text-red-300">
            <Loader2 size={12} className="animate-spin" /> Listening…
          </div>
        )}
      </div>

      {isHero && projectPlatforms && onProjectPlatformsChange && (
        <div className="mx-auto mt-3 flex max-w-3xl flex-wrap items-center justify-center gap-1.5">
          {([
            { id: "web" as const, label: "Web", icon: Globe2 },
            { id: "ios" as const, label: "iOS", icon: Smartphone },
            { id: "android" as const, label: "Android", icon: Smartphone },
          ]).map((platform) => {
            const Icon = platform.icon;
            const selected = projectPlatforms.includes(platform.id);
            return (
              <button
                key={platform.id}
                type="button"
                onClick={() =>
                  onProjectPlatformsChange(
                    toggleProjectPlatform(projectPlatforms, platform.id),
                  )
                }
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition",
                  selected
                    ? "border-zinc-500 bg-zinc-800 text-white"
                    : "border-zinc-800 bg-transparent text-zinc-500 hover:text-zinc-300",
                )}
                aria-pressed={selected}
              >
                <Icon size={13} /> {platform.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}