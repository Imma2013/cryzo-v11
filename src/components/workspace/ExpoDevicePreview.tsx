"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Copy, ExternalLink, Loader2, QrCode, RefreshCw, X } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FileMap } from "@/lib/workspace/types";
import { mobileSourceFiles } from "@/lib/workspace/mobile-source-files";
import { isExpoProject } from "@/lib/workspace/expo-starter";
import type { ExpoPreview } from "@/lib/workspace/expo-preview";
import { LivePreview } from "./LivePreview";

export function useExpoPreview(conversationId: Id<"conversations">, files: FileMap, ready: boolean, enabled: boolean) {
  const token = useAuthToken();
  const [data, setData] = useState<ExpoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const source = useMemo(() => JSON.stringify(mobileSourceFiles(files)), [files]);
  const isExpo = isExpoProject(files);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const start = useCallback(async (forceRestart = false) => {
    if (!enabled || !ready || !token || !isExpo) return;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const version = ++sequence.current;
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/publish/mobile", {
        method: "POST", signal: controller.signal,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ operation: "preview", conversationId, forceRestart, sourceFiles: JSON.parse(source) }),
      });
      const body = await response.json();
      if (!response.ok || !body.deviceUrl) throw new Error(body.error || "Expo could not start. Retry or inspect the terminal output.");
      if (version === sequence.current) setData(body);
    } catch (failure) {
      if (version === sequence.current && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Expo preview could not start.");
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [conversationId, enabled, ready, token, isExpo, source]);
  useEffect(() => {
    if (!enabled || !ready) return;
    const timer = window.setTimeout(() => { void start(); }, 600);
    return () => { window.clearTimeout(timer); pending.current?.abort(); ++sequence.current; };
  }, [enabled, ready, start]);
  useEffect(() => {
    setData(null); setError(""); setLoading(false);
  }, [conversationId, token]);
  useEffect(() => {
    const focus = () => { if (document.visibilityState === "visible") void start(); };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [start]);
  return { data, loading, error, ready, start };
}

export type ExpoPreviewState = ReturnType<typeof useExpoPreview>;

export function NativeExpoPreview({ preview }: { preview: ExpoPreviewState }) {
  if (preview.data?.webPreviewUrl) return <LivePreview url={preview.data.webPreviewUrl} isBooting={false} progress="ready" mobile networkPreview />;
  return <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-950 px-6 text-center text-white">
    {preview.loading ? <><Loader2 className="animate-spin" /><p>Starting your app preview…</p></> :
      <><p>{preview.error || (preview.ready ? "Browser preview is unavailable for this app's native modules. Device Preview opens the native app." : "Creating your mobile app…")}</p>
      {preview.ready && <button type="button" onClick={() => void preview.start(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-sm">Retry preview</button>}</>}
  </div>;
}

export function ExpoDevicePreview({ preview, compact = false }: { preview: ExpoPreviewState; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("keydown", close); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  const canScan = preview.ready && !preview.loading && !preview.error && preview.data;
  return <div ref={container} className="relative">
    <button type="button" aria-label="Device Preview" aria-expanded={open} aria-controls="expo-device-popover"
      onClick={() => { setOpen(value => !value); if (!open) void preview.start(); }}
      className={compact ? "inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-black" : "inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-600 px-2.5 text-xs text-zinc-200 hover:bg-zinc-800"}>
      <QrCode size={compact ? 22 : 15} />{!compact && "Device Preview"}
    </button>
    {open && <section id="expo-device-popover" aria-label="Expo phone preview" className={"absolute right-0 z-[220] w-72 max-w-[90vw] rounded-2xl border border-zinc-600 bg-zinc-950 p-4 text-white shadow-2xl " + (compact ? "bottom-full mb-2" : "top-full mt-2")}>
      <div className="flex items-center justify-between"><h2 className="font-semibold">Preview on your phone</h2><button type="button" aria-label="Close phone preview" onClick={() => setOpen(false)}><X size={16}/></button></div>
      <p className="mt-2 text-xs leading-5 text-zinc-300">{preview.data?.launchTarget === "development-build" ? "Install this project's development build, then scan to open it." : "Install Expo Go. Scan with your iPhone camera or the scanner in Expo Go on Android."}</p>
      {preview.loading && <p role="status" className="mt-4 flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin"/>Starting Expo…</p>}
      {!preview.ready && <p className="mt-3 text-xs text-zinc-300">The QR code will be ready when generation finishes.</p>}
      {preview.error && <p role="alert" className="mt-3 text-xs text-red-300">{preview.error}</p>}
      {canScan && <div className="mt-4">
        <img src={"/api/publish/mobile/qr?data=" + encodeURIComponent(canScan.deviceUrl)} width={224} height={224} alt="Scan to open your app" className="mx-auto rounded-lg bg-white p-2"/>
        <a href={canScan.deviceUrl} className="mt-3 flex items-center justify-center gap-2 text-xs text-blue-300"><ExternalLink size={13}/>Open app</a>
        <button type="button" onClick={() => void navigator.clipboard.writeText(canScan.deviceUrl).catch(() => setCopyError("Copy failed. Use Open app."))} className="mt-2 flex w-full items-center justify-center gap-2 text-xs text-zinc-300"><Copy size={13}/>Copy link</button>
      </div>}
      {copyError && <p role="alert" className="mt-2 text-xs text-red-300">{copyError}</p>}
      <button type="button" disabled={preview.loading || !preview.ready} onClick={() => void preview.start(true)} className="mt-4 flex items-center gap-2 text-xs text-zinc-300 disabled:opacity-40"><RefreshCw size={13}/>Reconnect</button>
    </section>}
  </div>;
}
