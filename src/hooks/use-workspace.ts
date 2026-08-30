"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import type { StreamingRuntimeSnapshot } from "@/lib/workspace/streaming-runtime";
import {
  getStreamingRuntimeSnapshot,
  isStreamingRuntimeActive,
  restoreStreamingRuntime,
  subscribeStreamingRuntime,
} from "@/lib/workspace/streaming-runtime";

export function useWorkspace(conversationId: Id<"conversations">) {
  const runtimeId = String(conversationId);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [runtime, setRuntime] = useState<StreamingRuntimeSnapshot>(() =>
    getStreamingRuntimeSnapshot(runtimeId),
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId,
  });

  useEffect(() => {
    setRuntime(getStreamingRuntimeSnapshot(runtimeId));
    setSelectedFile(null);

    const unsubscribe = subscribeStreamingRuntime(runtimeId, (next) => {
      setRuntime(next);
    });

    return unsubscribe;
  }, [runtimeId]);

  // Hard refresh / old conversation restore. Convex remains the durable source
  // of project actions; execution now happens in a named persistent Vercel Sandbox.
  // Do not restore until the current Convex session is fully authenticated. On a
  // fast account switch, this prevents a new conversation from racing a stale
  // browser auth token into the sandbox ownership check.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (!artifacts?.length) return;
    if (isStreamingRuntimeActive(runtimeId)) return;

    const actions = artifacts.flatMap((artifact) => artifact.actions);
    void restoreStreamingRuntime(runtimeId, actions);
  }, [artifacts, authLoading, isAuthenticated, runtimeId]);

  const firstFile = useMemo(
    () =>
      Object.entries(runtime.files).find(([, entry]) => entry.type === "file")?.[0] ??
      null,
    [runtime.files],
  );

  useEffect(() => {
    if (selectedFile && runtime.files[selectedFile]?.type === "file") return;
    if (selectedFile !== firstFile) setSelectedFile(firstFile);
  }, [firstFile, runtime.files, selectedFile]);

  const isBooting =
    isAuthenticated &&
    runtime.active &&
    runtime.progress !== "ready" &&
    runtime.progress !== "error";

  return {
    files: runtime.files,
    previewUrl: runtime.previewUrl,
    terminalOutput: runtime.terminalOutput,
    progress: runtime.progress,
    error: runtime.error,
    isBooting,
    selectedFile,
    setSelectedFile,
  };
}
