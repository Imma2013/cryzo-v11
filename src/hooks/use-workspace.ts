"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import type { StreamingRuntimeSnapshot } from "@/lib/workspace/streaming-runtime";
import { editorSession } from "@/lib/workspace/editor-session";
import { nativeTargetFromActions } from "@/lib/workspace/native-target";
import {
  getStreamingRuntimeSnapshot,
  isStreamingRuntimeActive,
  restoreStreamingRuntime,
  recoverStreamingRuntime,
  configureStreamingRuntimeTarget,
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
  const hiddenAt = useRef<number | null>(null);
  const recoveryPending = useRef(false);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId,
  });
  const conversation = useQuery(api.conversations.get, { id: conversationId });
  const isNativeProject = Boolean(conversation?.projectPlatforms?.some((platform) => platform === "ios" || platform === "android")) ||
    Boolean(artifacts?.some((artifact) => nativeTargetFromActions(artifact.actions)));

  useEffect(() => {
    if (isNativeProject) configureStreamingRuntimeTarget(runtimeId, true);
  }, [isNativeProject, runtimeId]);

  useEffect(() => {
    setRuntime(getStreamingRuntimeSnapshot(runtimeId));
    setSelectedFile(editorSession(runtimeId).selected);

    const unsubscribe = subscribeStreamingRuntime(runtimeId, (next) => {
      setRuntime(next);
    });

    return unsubscribe;
  }, [runtimeId]);

  useEffect(() => {
    if (authLoading || !isAuthenticated || !authToken) return;
    if (!artifacts?.length || !conversation) return;
    if (isStreamingRuntimeActive(runtimeId)) return;

    const actions = artifacts.flatMap((artifact) => artifact.actions);
    void restoreStreamingRuntime(runtimeId, actions, isNativeProject);
  }, [artifacts, authLoading, authToken, isAuthenticated, runtimeId, conversation, isNativeProject]);

  useEffect(() => {
    const resume = (forceTransportRecovery = false) => {
      if (document.visibilityState !== "visible" || recoveryPending.current || !artifacts?.length) return;
      // Distinguish brief transitions from a long, potentially killed browser kernel.
      if (hiddenAt.current === null || Date.now() - hiddenAt.current < 1200) return;
      hiddenAt.current = null;
      recoveryPending.current = true;
      void recoverStreamingRuntime(runtimeId, artifacts.flatMap((a) => a.actions), forceTransportRecovery, isNativeProject)
        .catch((error) => console.warn("Cryzo preview recovery failed", error))
        .finally(() => { recoveryPending.current = false; });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hiddenAt.current = Date.now();
      else resume();
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) hiddenAt.current ||= Date.now() - 1500;
      resume();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    const onTransportFailure = () => { hiddenAt.current = Date.now() - 1500; resume(true); };
    window.addEventListener("cryzo:preview-transport-failed", onTransportFailure);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("cryzo:preview-transport-failed", onTransportFailure);
    };
  }, [runtimeId, artifacts, isNativeProject]);

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
