"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import type { StreamingRuntimeSnapshot } from "@/lib/workspace/streaming-runtime";
import {
  getStreamingRuntimeSnapshot,
  isStreamingRuntimeActive,
  restoreStreamingRuntime,
  saveStreamingRuntimeFile,
  subscribeStreamingRuntime,
} from "@/lib/workspace/streaming-runtime";

export function useWorkspace(conversationId: Id<"conversations">) {
  const runtimeId = String(conversationId);
  const { authToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const saveManualFile = useMutation(api.artifacts.saveManualFile);
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

  useEffect(() => {
    if (authLoading || !isAuthenticated || !authToken) return;
    if (!artifacts?.length) return;
    if (isStreamingRuntimeActive(runtimeId)) return;

    const actions = artifacts.flatMap((artifact) => artifact.actions);
    void restoreStreamingRuntime(runtimeId, actions);
  }, [artifacts, authLoading, authToken, isAuthenticated, runtimeId]);

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

  const saveFile = async (filePath: string, content: string) => {
    const saved = await saveStreamingRuntimeFile(runtimeId, filePath, content);
    const artifactId = `manual:${Date.now()}:${crypto.randomUUID()}`;
    await saveManualFile({
      conversationId,
      artifactId,
      filePath: saved.filePath || filePath,
      content: saved.content,
    });
    return saved;
  };

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
    saveFile,
  };
}
