"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  Copy,
  ExternalLink,
  Loader2,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FileMap } from "@/lib/workspace/types";
import { mobileSourceFiles } from "@/lib/workspace/mobile-source-files";
import { isExpoProject } from "@/lib/workspace/expo-starter";
import type { ExpoPreview } from "@/lib/workspace/expo-preview";
import { LivePreview } from "./LivePreview";

export function useExpoPreview(
  conversationId: Id<"conversations">,
  files: FileMap,
  ready: boolean,
  enabled: boolean,
) {
  const token = useAuthToken();
  const [data, setData] = useState<
    (ExpoPreview & { conversationId: string; configuration: string }) | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("");
  const source = useMemo(
    () =>
      JSON.stringify(
        mobileSourceFiles(files).sort((a, b) => a.path.localeCompare(b.path)),
      ),
    [files],
  );
  const configuration = useMemo(
    () =>
      JSON.stringify(
        [
          "package.json",
          "app.json",
          "metro.config.js",
          "babel.config.js",
          "app.config.ts",
        ].map((path) => files[path]?.content),
      ),
    [files],
  );
  const isExpo = isExpoProject(files);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const lastStart = useRef(0);
  const start = useCallback(
    async (forceRestart = false) => {
      if (!enabled || !ready || !token || !isExpo || pending.current) return;
      const controller = new AbortController();
      pending.current = controller;
      const version = ++sequence.current;
      lastStart.current = Date.now();
      setLoading(true);
      setError("");
      setPhase("Starting Expo");
      try {
        const bytes = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(source),
        );
        const expectedKey = Array.from(new Uint8Array(bytes), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        // If another tab is installing an older revision, attach first, then sync this revision.
        for (let round = 0; round < 3; round++) {
          const response = await fetch("/api/publish/mobile", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              operation: "preview",
              conversationId,
              forceRestart: forceRestart && round === 0,
              sourceFiles: JSON.parse(source),
            }),
          });
          const body = await response.json();
          if (!response.ok || !body.id)
            throw new Error(
              body.error || "Expo could not start. Try reconnecting.",
            );
          let state: any;
          for (;;) {
            controller.signal.throwIfAborted();
            const status = await fetch(`/api/tasks/${body.id}`, {
              headers: { Authorization: "Bearer " + token },
              cache: "no-store",
              signal: controller.signal,
            });
            state = await status.json();
            if (!status.ok)
              throw new Error(state.error || "Unable to check Expo status");
            if (version === sequence.current) setPhase(state.phase);
            if (state.status === "failed" || state.status === "cancelled")
              throw new Error(state.error || "Expo stopped. Try reconnecting.");
            if (state.status === "complete") break;
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
          if (state.key.split(":")[0] !== expectedKey) continue;
          const result = JSON.parse(state.resultJson || "{}");
          if (!result.deviceUrl)
            throw new Error(
              "Expo did not return a device link. Try reconnecting.",
            );
          if (version === sequence.current)
            setData({ ...result, conversationId, configuration });
          return;
        }
        throw new Error(
          "The project changed during startup. Reconnect to load its latest files.",
        );
      } catch (failure) {
        if (version === sequence.current && !controller.signal.aborted)
          setError(
            failure instanceof Error
              ? failure.message
              : "Expo preview could not start.",
          );
      } finally {
        if (version === sequence.current) {
          setLoading(false);
          pending.current = null;
        }
      }
    },
    [conversationId, enabled, ready, token, isExpo, source, configuration],
  );
  useEffect(() => {
    if (!enabled || !ready) return;
    const timer = window.setTimeout(() => {
      void start();
    }, 600);
    return () => {
      window.clearTimeout(timer);
      pending.current?.abort();
      pending.current = null;
      ++sequence.current;
    };
  }, [enabled, ready, start]);
  useEffect(() => {
    const focus = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastStart.current > 30000
      )
        void start();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [start]);
  return {
    data:
      data?.conversationId === conversationId &&
      data.configuration === configuration
        ? data
        : null,
    conversationId,
    loading,
    error,
    phase,
    ready,
    start,
  };
}

export type ExpoPreviewState = ReturnType<typeof useExpoPreview>;

export function NativeExpoPreview({ preview }: { preview: ExpoPreviewState }) {
  if (preview.data?.webPreviewUrl)
    return (
      <LivePreview
        url={preview.data.webPreviewUrl}
        isBooting={false}
        progress="ready"
        mobile
        networkPreview
      />
    );
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-white">
      {preview.loading ? (
        <>
          <Loader2 className="animate-spin" />
          <p>Starting your app preview…</p>
        </>
      ) : (
        <>
          <p>
            {preview.error ||
              (preview.ready
                ? "Browser preview is unavailable for this app's native modules. Device Preview opens the native app."
                : "Creating your mobile app…")}
          </p>
          {preview.ready && (
            <button
              type="button"
              onClick={() => void preview.start(true)}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm"
            >
              Retry preview
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function ExpoDevicePreview({
  preview,
  compact = false,
}: {
  preview: ExpoPreviewState;
  compact?: boolean;
}) {
  const [popup, setPopup] = useState({
    projectId: preview.conversationId,
    open: false,
    autoOpened: false,
  });
  if (popup.projectId !== preview.conversationId) {
    setPopup({
      projectId: preview.conversationId,
      open: false,
      autoOpened: false,
    });
  } else if (preview.data?.deviceUrl && !popup.autoOpened) {
    setPopup({ ...popup, open: true, autoOpened: true });
  }
  const open = popup.projectId === preview.conversationId && popup.open;
  const setOpen = useCallback(
    (value: boolean | ((previous: boolean) => boolean)) => {
      setPopup((previous) => ({
        ...previous,
        open: typeof value === "function" ? value(previous.open) : value,
      }));
    },
    [],
  );
  const [copyError, setCopyError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, setOpen]);
  const canScan = preview.data;
  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label="Device Preview"
        aria-expanded={open}
        aria-controls="expo-device-popover"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void preview.start();
        }}
        className={
          compact
            ? "inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-black"
            : "inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-600 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800"
        }
      >
        <QrCode size={compact ? 22 : 15} />
        {!compact && "Device Preview"}
      </button>
      {open && (
        <section
          id="expo-device-popover"
          aria-label="Expo phone preview"
          className={
            "absolute right-0 z-[220] w-72 max-w-[90vw] rounded-2xl border border-zinc-600 bg-zinc-950 p-4 text-white shadow-2xl " +
            (compact ? "bottom-full mb-2" : "top-full mt-2")
          }
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Preview on your phone</h2>
            <button
              type="button"
              aria-label="Close phone preview"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-zinc-300">
            {preview.data?.launchTarget === "development-build"
              ? "Install this project's development build, then scan to open it."
              : "Install Expo Go. Scan with your iPhone camera or the scanner in Expo Go on Android."}
          </p>
          {preview.loading && (
            <p role="status" className="mt-4 flex items-center gap-2 text-xs">
              <Loader2 size={14} className="animate-spin" />
              {preview.phase || "Starting Expo…"}
            </p>
          )}
          {!preview.ready && (
            <p className="mt-3 text-xs text-zinc-300">
              The QR code will be ready when generation finishes.
            </p>
          )}
          {preview.error && (
            <p role="alert" className="mt-3 text-xs text-red-300">
              {preview.error}
            </p>
          )}
          {canScan && (
            <div className="mt-4">
              <img
                src={
                  "/api/publish/mobile/qr?data=" +
                  encodeURIComponent(canScan.deviceUrl)
                }
                width={224}
                height={224}
                alt="Scan to open your app"
                className="mx-auto rounded-lg bg-white p-2"
              />
              <a
                href={canScan.deviceUrl}
                className="mt-3 flex items-center justify-center gap-2 text-xs text-blue-300"
              >
                <ExternalLink size={13} />
                Open app
              </a>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(canScan.deviceUrl)
                    .catch(() => setCopyError("Copy failed. Use Open app."))
                }
                className="mt-2 flex w-full items-center justify-center gap-2 text-xs text-zinc-300"
              >
                <Copy size={13} />
                Copy link
              </button>
            </div>
          )}
          {copyError && (
            <p role="alert" className="mt-2 text-xs text-red-300">
              {copyError}
            </p>
          )}
          <button
            type="button"
            disabled={preview.loading || !preview.ready}
            onClick={() => void preview.start(true)}
            className="mt-4 flex items-center gap-2 text-xs text-zinc-300 disabled:opacity-40"
          >
            <RefreshCw size={13} />
            Reconnect
          </button>
        </section>
      )}
    </div>
  );
}
