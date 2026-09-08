"use client";

import {
  AlertCircle,
  Crosshair,
  Loader2,
  Maximize2,
  Minimize2,
  Monitor,
  RefreshCw,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import type { ProgressStage } from "@/lib/workspace/action-runner";

export interface ElementInfo {
  tagName: string;
  className: string;
  id: string;
  textContent: string;
  selector: string;
  rect: { x: number; y: number; width: number; height: number };
}

const DEVICES = [
  { name: "Desktop", width: "100%", icon: Monitor },
  { name: "Tablet", width: "768px", icon: Tablet },
  { name: "Mobile", width: "375px", icon: Smartphone },
] as const;

type PreviewHealth = "checking" | "healthy" | "error";

export function LivePreview({
  url,
  isBooting,
  progress,
  onElementSelected,
  mobile = false,
  refreshToken = 0,
  inspectRequest = 0,
}: {
  url: string | null;
  isBooting: boolean;
  progress: ProgressStage;
  onElementSelected?: (info: ElementInfo) => void;
  mobile?: boolean;
  refreshToken?: number;
  inspectRequest?: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inspectorActiveRef = useRef(false);
  const healthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
  const [previewHealth, setPreviewHealth] = useState<PreviewHealth>("checking");
  const [previewHealthError, setPreviewHealthError] = useState("");

  const clearHealthTimer = useCallback(() => {
    if (healthTimerRef.current) clearTimeout(healthTimerRef.current);
    healthTimerRef.current = null;
  }, []);

  const postInspectorState = useCallback((active: boolean) => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "INSPECTOR_ACTIVATE", active },
      "*",
    );
  }, []);

  const setInspector = useCallback((active: boolean) => {
    inspectorActiveRef.current = active;
    setInspectorActive(active);
    if (active) setSelectedElement(null);
    postInspectorState(active);
  }, [postInspectorState]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow || !e.data?.type) return;

      if (e.data.type === "INSPECTOR_READY") {
        postInspectorState(inspectorActiveRef.current);
        return;
      }

      if (e.data.type === "CRYZO_PREVIEW_HEALTH") {
        clearHealthTimer();
        if (e.data.healthy) {
          setPreviewHealth("healthy");
          setPreviewHealthError("");
        } else {
          setPreviewHealth("error");
          setPreviewHealthError(
            typeof e.data.reason === "string" && e.data.reason
              ? e.data.reason
              : "The preview loaded but rendered no visible application content.",
          );
        }
        return;
      }

      if (e.data.type === "CRYZO_PREVIEW_CRASH") {
        clearHealthTimer();
        setPreviewHealth("error");
        setPreviewHealthError(
          typeof e.data.message === "string" && e.data.message
            ? e.data.message
            : "The application crashed while rendering.",
        );
        return;
      }

      if (e.data.type === "INSPECTOR_CLICK") {
        const info = e.data.elementInfo as ElementInfo;
        setSelectedElement(info);
        onElementSelected?.(info);
        inspectorActiveRef.current = false;
        setInspectorActive(false);
        postInspectorState(false);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [clearHealthTimer, onElementSelected, postInspectorState]);

  const toggleInspector = useCallback(() => {
    setInspector(!inspectorActiveRef.current);
  }, [setInspector]);

  const handleFrameLoad = useCallback(() => {
    postInspectorState(inspectorActiveRef.current);
    clearHealthTimer();
    setPreviewHealth("checking");
    setPreviewHealthError("");
    healthTimerRef.current = setTimeout(() => {
      setPreviewHealth((current) => {
        if (current !== "checking") return current;
        setPreviewHealthError(
          "Cryzo could not confirm that the application rendered. Refresh the preview or check the generated code.",
        );
        return "error";
      });
    }, 3500);
  }, [clearHealthTimer, postInspectorState]);

  const handleRefresh = useCallback(() => {
    setPreviewHealth("checking");
    setPreviewHealthError("");
    clearHealthTimer();
    if (iframeRef.current && url) {
      iframeRef.current.src = "about:blank";
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = url;
      });
    }
  }, [clearHealthTimer, url]);

  useEffect(() => {
    setPreviewHealth("checking");
    setPreviewHealthError("");
    clearHealthTimer();
  }, [clearHealthTimer, url]);

  useEffect(() => {
    if (refreshToken > 0) handleRefresh();
  }, [refreshToken, handleRefresh]);

  useEffect(() => {
    if (inspectRequest <= 0 || !url) return;
    setInspector(true);
  }, [inspectRequest, url, setInspector]);

  useEffect(() => () => clearHealthTimer(), [clearHealthTimer]);

  const toggleFullscreen = async () => {
    if (!isFullscreen && containerRef.current) {
      await containerRef.current.requestFullscreen();
    } else if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-zinc-950 text-sm text-zinc-500">
        {isBooting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={28} className="animate-spin text-blue-500" />
            <span>
              {progress === "writing" && "Writing project files..."}
              {progress === "installing" && "Installing dependencies..."}
              {progress === "starting" && "Starting dev server..."}
              {progress === "error" && "Failed to start. Check terminal."}
            </span>
          </div>
        ) : progress === "error" ? (
          <span className="text-red-400">Dev server failed. Check terminal.</span>
        ) : (
          <span>Waiting for dev server...</span>
        )}
      </div>
    );
  }

  const healthOverlay = previewHealth !== "healthy" ? (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[var(--cryzo-panel)]/95 px-6 text-center backdrop-blur-[1px]">
      {previewHealth === "checking" ? (
        <div className="flex flex-col items-center gap-3 text-[var(--cryzo-muted)]">
          <Loader2 size={30} className="animate-spin text-[var(--cryzo-accent)]" />
          <div>
            <p className="text-sm font-medium text-[var(--cryzo-text)]">Rendering preview…</p>
            <p className="mt-1 text-xs">Checking that the generated app actually mounted.</p>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto max-w-md rounded-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-card)] p-5 shadow-xl">
          <AlertCircle className="mx-auto text-red-500" size={27} />
          <h3 className="mt-3 text-sm font-semibold text-[var(--cryzo-text)]">Preview failed to render</h3>
          <p className="mt-2 text-xs leading-5 text-[var(--cryzo-muted)]">{previewHealthError}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] px-3 text-xs font-medium text-[var(--cryzo-text)] hover:opacity-80"
          >
            <RefreshCw size={13} /> Refresh preview
          </button>
        </div>
      )}
    </div>
  ) : null;

  if (mobile) {
    return (
      <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-white">
        <iframe
          ref={iframeRef}
          src={url}
          title="Cryzo live preview"
          className="block h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
          allow="cross-origin-isolated"
          loading="eager"
          onLoad={handleFrameLoad}
        />
        {healthOverlay}
      </div>
    );
  }

  const device = DEVICES[deviceIdx];

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-[var(--cryzo-panel)]">
      <div className="flex items-center gap-1 border-b border-[var(--cryzo-border)] px-2 py-1">
        <button
          onClick={handleRefresh}
          className="rounded p-1.5 text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--cryzo-border)]" />

        <button
          onClick={toggleInspector}
          className={`rounded p-1.5 transition-colors ${
            inspectorActive
              ? "bg-blue-600 text-white"
              : "text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
          }`}
          title="Select element"
        >
          <Crosshair size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-[var(--cryzo-border)]" />

        {DEVICES.map((d, i) => (
          <button
            key={d.name}
            onClick={() => setDeviceIdx(i)}
            className={`rounded p-1.5 transition-colors ${
              deviceIdx === i
                ? "bg-[var(--cryzo-card)] text-[var(--cryzo-text)]"
                : "text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
            }`}
            title={d.name}
          >
            <d.icon size={13} />
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-[var(--cryzo-border)]" />

        <button
          onClick={toggleFullscreen}
          className="rounded p-1.5 text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {selectedElement && (
          <div className="ml-auto truncate rounded bg-[var(--cryzo-card)] px-2 py-0.5 text-[10px] text-[var(--cryzo-muted)]">
            {selectedElement.selector}
          </div>
        )}
      </div>

      <div className="relative flex flex-1 items-start justify-center overflow-hidden bg-[var(--cryzo-canvas)] p-2">
        <iframe
          ref={iframeRef}
          src={url}
          title="Cryzo live preview"
          className="h-full rounded bg-white shadow-lg"
          style={{ width: device.width, maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
          allow="cross-origin-isolated"
          loading="eager"
          onLoad={handleFrameLoad}
        />
        {healthOverlay}
      </div>
    </div>
  );
}