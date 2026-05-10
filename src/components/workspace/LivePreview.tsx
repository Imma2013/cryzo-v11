"use client";

import { RefreshCw, Loader2, Crosshair, Monitor, Tablet, Smartphone, Maximize2, Minimize2 } from "lucide-react";
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

export function LivePreview({
  url,
  isBooting,
  progress,
  onElementSelected,
}: {
  url: string | null;
  isBooting: boolean;
  progress: ProgressStage;
  onElementSelected?: (info: ElementInfo) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

  // Listen for inspector messages from iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data?.type) return;
      if (e.data.type === "INSPECTOR_CLICK") {
        const info = e.data.elementInfo as ElementInfo;
        setSelectedElement(info);
        onElementSelected?.(info);
        setInspectorActive(false);
        // Deactivate inspector after selection
        iframeRef.current?.contentWindow?.postMessage(
          { type: "INSPECTOR_ACTIVATE", active: false },
          "*"
        );
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onElementSelected]);

  const toggleInspector = useCallback(() => {
    const next = !inspectorActive;
    setInspectorActive(next);
    if (next) setSelectedElement(null);
    iframeRef.current?.contentWindow?.postMessage(
      { type: "INSPECTOR_ACTIVATE", active: next },
      "*"
    );
  }, [inspectorActive]);

  const handleRefresh = () => {
    if (iframeRef.current && url) {
      iframeRef.current.src = url;
    }
  };

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
      <div className="flex h-full flex-col items-center justify-center bg-zinc-900 text-sm text-zinc-500">
        {isBooting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-zinc-400" />
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

  const device = DEVICES[deviceIdx];

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1">
        <button
          onClick={handleRefresh}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        {/* Inspector toggle */}
        <button
          onClick={toggleInspector}
          className={`rounded p-1.5 transition-colors ${
            inspectorActive
              ? "bg-blue-600 text-white"
              : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
          }`}
          title="Select element"
        >
          <Crosshair size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        {/* Device size buttons */}
        {DEVICES.map((d, i) => (
          <button
            key={d.name}
            onClick={() => setDeviceIdx(i)}
            className={`rounded p-1.5 transition-colors ${
              deviceIdx === i
                ? "bg-zinc-700 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
            title={d.name}
          >
            <d.icon size={13} />
          </button>
        ))}

        <div className="mx-1 h-4 w-px bg-zinc-800" />

        {/* Fullscreen */}
        <button
          onClick={toggleFullscreen}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {/* Selected element indicator */}
        {selectedElement && (
          <div className="ml-auto truncate rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            {selectedElement.selector}
          </div>
        )}
      </div>

      {/* Preview iframe */}
      <div className="flex flex-1 items-start justify-center overflow-hidden bg-zinc-950 p-2">
        <iframe
          ref={iframeRef}
          src={url}
          className="h-full rounded bg-white shadow-lg"
          style={{ width: device.width, maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      </div>
    </div>
  );
}
