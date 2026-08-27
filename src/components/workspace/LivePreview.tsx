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
import { CryzoLogo } from "@/components/CryzoLogo";
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
}: {
  url: string | null;
  isBooting: boolean;
  progress: ProgressStage;
  onElementSelected?: (info: ElementInfo) => void;
  mobile?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [inspectorActive, setInspectorActive] = useState(false);
  const [deviceIdx, setDeviceIdx] = useState(mobile ? 2 : 0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

  useEffect(() => {
    if (mobile) setDeviceIdx(2);
  }, [mobile]);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data?.type) return;
      if (e.data.type === "INSPECTOR_CLICK") {
        const info = e.data.elementInfo as ElementInfo;
        setSelectedElement(info);
        onElementSelected?.(info);
        setInspectorActive(false);
        iframeRef.current?.contentWindow?.postMessage(
          { type: "INSPECTOR_ACTIVATE", active: false },
          "*",
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
      "*",
    );
  }, [inspectorActive]);

  const handleRefresh = () => {
    if (iframeRef.current && url) iframeRef.current.src = url;
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
      <div
        className={`flex h-full flex-col items-center justify-center text-sm ${
          mobile
            ? "bg-[#f8f8f6] text-zinc-500"
            : "bg-zinc-900 text-zinc-500"
        }`}
      >
        {isBooting ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin" />
            <span>
              {progress === "writing" && "Writing project files..."}
              {progress === "installing" && "Installing dependencies..."}
              {progress === "starting" && "Starting dev server..."}
              {progress === "error" && "Failed to start. Check terminal."}
            </span>
          </div>
        ) : progress === "error" ? (
          <span className="text-red-500">Dev server failed. Check terminal.</span>
        ) : (
          <span>Waiting for dev server...</span>
        )}
      </div>
    );
  }

  const device = DEVICES[deviceIdx];

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 flex-col ${
        mobile ? "bg-white" : "bg-zinc-900"
      }`}
    >
      {mobile ? (
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-zinc-200 bg-[#faf9f7] px-3">
          <button
            onClick={handleRefresh}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            title="Refresh"
          >
            <RefreshCw size={18} />
          </button>

          <div className="flex min-w-0 flex-1 items-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-sm">
            <span className="truncate">Home</span>
          </div>

          <button
            onClick={toggleInspector}
            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
              inspectorActive
                ? "bg-black text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
            }`}
            title="Select element"
          >
            <Crosshair size={18} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1.5">
          <button
            onClick={handleRefresh}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={toggleInspector}
            className={`rounded-lg p-2 transition-colors ${
              inspectorActive
                ? "bg-blue-600 text-white"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            }`}
            title="Select element"
          >
            <Crosshair size={14} />
          </button>

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

          <button
            onClick={toggleFullscreen}
            className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          {selectedElement && (
            <div className="ml-auto max-w-[42%] truncate rounded-md bg-zinc-800 px-2 py-1 text-[10px] text-zinc-400">
              {selectedElement.selector}
            </div>
          )}
        </div>
      )}

      <div
        className={`relative flex min-h-0 flex-1 items-start justify-center overflow-hidden ${
          mobile ? "bg-white p-0" : "bg-zinc-950 p-2"
        }`}
      >
        <iframe
          ref={iframeRef}
          src={url}
          className={`h-full bg-white ${mobile ? "w-full" : "rounded shadow-lg"}`}
          style={{ width: mobile ? "100%" : device.width, maxWidth: "100%" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />

        <a
          href="https://cryzo.me"
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-4 left-4 z-20 inline-flex h-10 items-center gap-2 rounded-xl bg-black px-3 text-xs font-medium text-white shadow-xl shadow-black/20 ring-1 ring-white/10"
          aria-label="Built with Cryzo"
        >
          <CryzoLogo size={22} />
          <span>Built with <strong>Cryzo</strong></span>
        </a>
      </div>
    </div>
  );
}
