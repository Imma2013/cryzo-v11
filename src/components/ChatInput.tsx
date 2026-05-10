"use client";

import { useEffect, useRef, useState } from "react";
import {
  Hammer,
  ImagePlus,
  Lightbulb,
  Loader2,
  Mic,
  MicOff,
  Send,
  Square,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ChatMode = "build" | "plan";

type ImageAttachment = {
  id: string;
  file: File;
  previewUrl: string;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: {
    [index: number]: {
      transcript: string;
    };
  };
};

type SpeechRecognitionEventLike = {
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorLike = {
  error?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;

function createAttachment(file: File): ImageAttachment {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${file.name}-${file.lastModified}-${Math.random()}`;

  return {
    id,
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
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (files: File[]) => Promise<void> | void;
  onStop: () => void;
  isLoading: boolean;
  disabled: boolean;
  chatMode: ChatMode;
  onChatModeChange: (mode: ChatMode) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const attachmentsRef = useRef<ImageAttachment[]>([]);
  const valueRef = useRef(value);
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const speechSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 180) + "px";
    }
  }, [value]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
      attachmentsRef.current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      );
    };
  }, []);

  const addFiles = (files: File[]) => {
    const images = validImageFiles(files);
    if (images.length !== files.length) {
      setAttachmentError("Only images up to 8MB can be attached.");
    } else {
      setAttachmentError(null);
    }

    if (images.length === 0) return;

    const remaining = MAX_ATTACHMENTS - attachments.length;
    const nextImages = images.slice(0, Math.max(remaining, 0));
    if (nextImages.length < images.length) {
      setAttachmentError(`You can attach up to ${MAX_ATTACHMENTS} images.`);
    }

    setAttachments((current) => [...current, ...nextImages.map(createAttachment)]);
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
      current.forEach((attachment) =>
        URL.revokeObjectURL(attachment.previewUrl),
      );
      return [];
    });
  };

  const handleSubmit = async () => {
    if (isLoading) {
      onStop();
      return;
    }

    if (disabled || (!value.trim() && attachments.length === 0)) return;

    const files = attachments.map((attachment) => attachment.file);
    await onSubmit(files);
    clearAttachments();
    setAttachmentError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files));
  };

  const appendTranscript = (text: string) => {
    const currentValue = valueRef.current.trim();
    onChange(currentValue ? `${currentValue} ${text}` : text);
  };

  const toggleListening = () => {
    if (!speechSupported || disabled || isLoading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const Recognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const results = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index],
      );
      const transcript = results
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) appendTranscript(transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const canSend = value.trim().length > 0 || attachments.length > 0;

  return (
    <div className="border-t border-zinc-800 bg-black px-4 py-4">
      <div
        className={cn(
          "mx-auto max-w-3xl rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black/30 transition-colors",
          "focus-within:border-zinc-600",
          isDragging && "border-blue-500 ring-2 ring-blue-500/30",
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-b border-zinc-900 px-3 pt-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
              >
                <img
                  src={attachment.previewUrl}
                  alt={attachment.file.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(attachment.id)}
                  className="absolute right-1 top-1 rounded-full bg-black/80 p-1 text-zinc-300 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
                  aria-label={`Remove ${attachment.file.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {attachmentError && (
          <div className="border-b border-zinc-900 px-3 py-2 text-xs text-amber-300">
            {attachmentError}
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={
            chatMode === "plan"
              ? "Plan before building..."
              : "Ask Cryzo to build, edit, or connect apps..."
          }
          disabled={disabled}
          rows={1}
          className="block max-h-44 min-h-24 w-full resize-none bg-transparent px-4 py-4 text-sm leading-6 text-white placeholder-zinc-500 outline-none disabled:opacity-50"
        />

        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              <button
                type="button"
                onClick={() => onChatModeChange("build")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  chatMode === "build"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-white",
                )}
                title="Build mode"
              >
                <Hammer size={14} />
                Build
              </button>
              <button
                type="button"
                onClick={() => onChatModeChange("plan")}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                  chatMode === "plan"
                    ? "bg-blue-500 text-white"
                    : "text-zinc-400 hover:text-white",
                )}
                title="Plan mode"
              >
                <Lightbulb size={14} />
                Plan
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              title="Upload image"
            >
              <ImagePlus size={18} />
            </button>

            <button
              type="button"
              onClick={toggleListening}
              disabled={!speechSupported || disabled || isLoading}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40",
                isListening && "bg-red-500/10 text-red-400 hover:text-red-300",
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
          </div>

          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!isLoading && (disabled || !canSend)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors",
              isLoading
                ? "bg-zinc-800 text-white hover:bg-zinc-700"
                : "bg-white text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {isLoading ? (
              <>
                <Square size={14} />
                Stop
              </>
            ) : (
              <>
                <Send size={14} />
                Send
              </>
            )}
          </button>
        </div>

        {isListening && (
          <div className="flex items-center gap-2 border-t border-zinc-900 px-3 py-2 text-xs text-red-300">
            <Loader2 size={12} className="animate-spin" />
            Listening...
          </div>
        )}
      </div>
    </div>
  );
}
