"use client";

import { useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { ExternalLink, Loader2, QrCode, RefreshCw, X } from "lucide-react";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FileMap } from "@/lib/workspace/types";
import { mobileSourceFiles } from "@/lib/workspace/mobile-source-files";
import { isExpoProject } from "@/lib/workspace/expo-starter";

/** Expo preview is available only for an actual Expo/React Native project. */
export function ExpoDevicePreview({ conversationId, files, compact = false, ready = true }: {
  conversationId: Id<"conversations">;
  files: FileMap;
  compact?: boolean;
  ready?: boolean;
}) {
  const authToken = useAuthToken();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  const start = async (refresh = false) => {
    setOpen(true);
    if (loading || (url && !refresh)) return;
    if (!ready) {
      setError("Cryzo is still creating or checking the native app. Device Preview will be available when generation finishes.");
      return;
    }
    if (!isExpoProject(files)) {
      setError("Native Expo files are not ready yet. Generate the app first; Cryzo now initializes Expo automatically.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      if (!authToken) throw new Error("Sign in to start a phone preview.");
      const response = await fetch("/api/publish/mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          operation: "preview", conversationId, forceRestart: refresh,
          sourceFiles: mobileSourceFiles(files),
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.previewUrl) throw new Error(body.error || `Expo preview couldn't start (HTTP ${response.status}). Check your app source and try Reconnect.`);
      setUrl(String(body.previewUrl));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Expo preview could not start");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => void start()}
        aria-label="Device Preview (Expo Go)"
        className={compact
          ? "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black shadow-sm"
          : "inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"}>
        <QrCode size={compact ? 22 : 15}/>{!compact && " Device Preview"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/75 p-4" role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-label="Expo phone preview"
            className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-[#121216] p-6 text-center text-white shadow-2xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 rounded-lg p-2 text-zinc-400 hover:text-white"><X size={18}/></button>
            <h2 className="mt-1 text-2xl font-bold">Expo</h2>
            <p className="mt-3 text-sm text-zinc-300">Scan the code to reconnect to your React Native app.</p>
            <p className="mt-3 text-sm text-zinc-400">1. Install Expo Go on your phone<br/>2. Scan the QR code with your camera or Expo Go</p>
            {loading && <div className="my-8 flex items-center justify-center gap-2 text-sm text-zinc-300"><Loader2 className="animate-spin" size={18}/> Starting Expo tunnel…</div>}
            {error && <p role="alert" className="my-5 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
            {url && !loading && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <div className="rounded-xl bg-white p-3"><img alt="Expo Go scannable QR code" width={240} height={240}
                  src={`/api/publish/mobile/qr?data=${encodeURIComponent(url)}`} /></div>
                <a className="flex max-w-full items-center gap-1.5 break-all text-xs text-blue-300 underline" href={url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14}/> Open Expo preview link</a>
              </div>
            )}
            <button type="button" disabled={loading} onClick={() => void start(true)} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:opacity-40"><RefreshCw size={14}/> Reconnect</button>
            <p className="mt-4 text-xs text-zinc-500">Keep this Cryzo project open while testing. Custom native modules may require an Expo development build.</p>
          </section>
        </div>
      )}
    </>
  );
}
