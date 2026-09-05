"use client";

import {
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
  const [inspectorActive, setInspectorActive] = useState(false);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

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
  }, [onElementSelected, postInspectorState]);

  const toggleInspector = useCallback(() => {
    setInspector(!inspectorActiveRef.current);
  }, [setInspector]);

  const handleFrameLoad = useCallback(() => {
    postInspectorState(inspectorActiveRef.current);
  }, [postInspectorState]);

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && url) {
      iframeRef.current.src = "about:blank";
      requestAnimationFrame(() => {
        if (iframeRef.current) iframeRef.current.src = url;
      });
    }
  }, [url]);

  useEffect(() => {
    if (refreshToken > 0) handleRefresh();
  }, [refreshToken, handleRefresh]);

  useEffect(() => {
    if (inspectRequest <= 0 || !url) return;
    setInspector(true);
  }, [inspectRequest, url, setInspector]);

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

  if (mobile) {
    return (
      <div ref={containerRef} className="h-full w-full overflow-hidden bg-white">
        <iframe
          ref={iframeRef}
          src={url}
          title="Cryzo live preview"
          className="block h-full w-full border-0 bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
          loading="eager"
          onLoad={handleFrameLoad}
        />
      </div>
    );
  }

  const device = DEVICES[deviceIdx];

  return (
    <div ref={containerRef} className="flex h-full flex-col bg-zinc-900">
      <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1">
        <button
          onClick={handleRefresh}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          title="Refresh"
        >
          <RefreshCw size={13} />
        </button>

        <div className="mx-1 h-4 w-px bg-zinc-800" />

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

        <button
          onClick={toggleFullscreen}
          className="rounded p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>

        {selectedElement && (
          <div className="ml-auto truncate rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">
            {selectedElement.selector}
          </div>
        )}
      </div>

      <div className="flex flex-1 items-start justify-center overflow-hidden bg-zinc-950 p-2">
        <iframe
          ref={iframeRef}
          src={url}
          title="Cryzo live preview"
          className="h-full rounded bg-white shadow-lg"
          style={{ width: device.width, maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-storage-access-by-user-activation"
          loading="eager"
          onLoad={handleFrameLoad}
        />
      </div>
    </div>
  );
}
