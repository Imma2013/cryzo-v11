"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { ArtifactAction, FileMap } from "@/lib/workspace/types";
import type { ProgressStage } from "@/lib/workspace/action-runner";
import {
  isStreamingRuntimeActive,
  prebootStreamingRuntime,
  subscribeStreamingRuntime,
} from "@/lib/workspace/streaming-runtime";

export function useWorkspace(conversationId: Id<"conversations">) {
  const [files, setFiles] = useState<FileMap>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [progress, setProgress] = useState<ProgressStage>("writing");
  const [error, setError] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const bootedRef = useRef(false);
  const convIdRef = useRef(conversationId);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId,
  });

  // Reset React state when the conversation changes. The WebContainer itself is
  // intentionally kept warm across views/conversations, matching Bolt's model.
  useEffect(() => {
    if (conversationId !== convIdRef.current) {
      convIdRef.current = conversationId;
      bootedRef.current = false;
      appliedArtifactsRef.current = new Set();
      setFiles({});
      setPreviewUrl(null);
      setTerminalOutput("");
      setProgress("writing");
      setError(null);
      setIsBooting(true);
      setSelectedFile(null);
    }
  }, [conversationId]);

  // Start WebContainer boot as soon as the workspace exists rather than after a
  // completed artifact has made a Convex round-trip.
  useEffect(() => {
    void prebootStreamingRuntime().catch(() => {
      // Historical artifact fallback below will surface an actionable error if
      // boot actually fails. Preboot itself should not crash the page.
    });
  }, []);

  // Live streamed actions are the source of truth while a build is happening.
  // Convex remains persistence; it is not in the preview's critical path.
  useEffect(() => {
    return subscribeStreamingRuntime(String(conversationId), (runtime) => {
      if (!runtime.active) return;

      setFiles(runtime.files);
      setPreviewUrl(runtime.previewUrl);
      setTerminalOutput(runtime.terminalOutput);
      setProgress(runtime.progress);
      setError(runtime.error);
      setIsBooting(runtime.progress !== "ready" && runtime.progress !== "error");
      setSelectedFile((current) => {
        if (current && runtime.files[current]?.type === "file") return current;
        return (
          Object.entries(runtime.files).find(([, entry]) => entry.type === "file")?.[0] ??
          null
        );
      });
    });
  }, [conversationId]);

  const appendOutput = useCallback((data: string) => {
    setTerminalOutput((prev) => prev + data);
  }, []);

  const handleServerReady = useCallback((url: string) => {
    setPreviewUrl(url);
  }, []);

  const handleProgress = useCallback((stage: ProgressStage) => {
    setProgress(stage);
    if (stage === "error") {
      setError("Something went wrong. Check terminal for details.");
      setIsBooting(false);
    }
    if (stage === "ready") {
      setIsBooting(false);
    }
  }, []);

  // Track which persisted artifacts have been applied by the fallback loader.
  const appliedArtifactsRef = useRef<Set<string>>(new Set());

  // Restore an existing project after a hard refresh. New builds use the
  // streaming path above, but old Convex artifacts still need to be runnable.
  useEffect(() => {
    if (!artifacts || artifacts.length === 0 || bootedRef.current) return;
    if (isStreamingRuntimeActive(String(conversationId))) return;
    bootedRef.current = true;

    const boot = async () => {
      const { getWebContainer } = await import("@/lib/workspace/webcontainer");
      const { runActions } = await import("@/lib/workspace/action-runner");

      setIsBooting(true);
      setError(null);
      appendOutput("Restoring project runtime...\r\n");

      try {
        const bootTimeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("WebContainer boot timed out after 30s. Try refreshing the page.")),
            30000,
          ),
        );
        const wc = await Promise.race([getWebContainer(), bootTimeout]);
        appendOutput("WebContainer ready.\r\n\r\n");

        const allActions: ArtifactAction[] = artifacts.flatMap((a) => a.actions);

        for (const a of artifacts) {
          appliedArtifactsRef.current.add(a._id);
        }

        const fileMap: FileMap = {};
        for (const action of allActions) {
          if (action.type === "file" && action.filePath) {
            fileMap[action.filePath] = { type: "file", content: action.content };
            const parts = action.filePath.split("/");
            for (let i = 1; i < parts.length; i++) {
              const dir = parts.slice(0, i).join("/");
              if (!fileMap[dir]) fileMap[dir] = { type: "folder" };
            }
          }
        }
        setFiles(fileMap);

        setSelectedFile((current) => {
          if (current && fileMap[current]?.type === "file") return current;
          return Object.entries(fileMap).find(([, entry]) => entry.type === "file")?.[0] ?? null;
        });

        await runActions(
          wc,
          allActions,
          appendOutput,
          handleServerReady,
          handleProgress,
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        appendOutput(`\r\nFatal error: ${message}\r\n`);
        setError(message);
        setIsBooting(false);
      }
    };

    void boot();
  }, [artifacts, appendOutput, handleServerReady, handleProgress, conversationId]);

  // Persisted artifacts created after the historical boot are applied only when
  // there is no live streaming runtime. During a live build they are duplicates
  // of actions that were already executed directly from the model stream.
  useEffect(() => {
    if (!artifacts || !bootedRef.current) return;

    const newArtifacts = artifacts.filter(
      (a) => !appliedArtifactsRef.current.has(a._id),
    );
    if (newArtifacts.length === 0) return;

    for (const a of newArtifacts) {
      appliedArtifactsRef.current.add(a._id);
    }

    if (isStreamingRuntimeActive(String(conversationId))) return;

    const applyUpdates = async () => {
      const { getWebContainer, writeFiles } = await import(
        "@/lib/workspace/webcontainer"
      );

      try {
        const wc = await getWebContainer();
        const fileActions = newArtifacts.flatMap((a) =>
          a.actions.filter(
            (act): act is ArtifactAction & { filePath: string } =>
              act.type === "file" && !!act.filePath,
          ),
        );

        if (fileActions.length > 0) {
          appendOutput(`\r\nWriting ${fileActions.length} file(s)...\r\n`);
          await writeFiles(wc, fileActions);
          appendOutput("Done. HMR should refresh.\r\n");

          setFiles((prev) => {
            const next = { ...prev };
            for (const action of fileActions) {
              next[action.filePath] = { type: "file", content: action.content };
              const parts = action.filePath.split("/");
              for (let i = 1; i < parts.length; i++) {
                const dir = parts.slice(0, i).join("/");
                if (!next[dir]) next[dir] = { type: "folder" };
              }
            }
            return next;
          });
        }

        const shellActions = newArtifacts.flatMap((a) =>
          a.actions.filter(
            (act) =>
              act.type === "shell" &&
              !act.content.includes("npm install") &&
              !act.content.includes("npm i"),
          ),
        );
        if (shellActions.length > 0) {
          const { runCommand } = await import("@/lib/workspace/webcontainer");
          for (const action of shellActions) {
            appendOutput(`\r\n$ ${action.content}\r\n`);
            await runCommand(wc, action.content, appendOutput);
          }
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        appendOutput(`\r\nError applying update: ${message}\r\n`);
      }
    };

    void applyUpdates();
  }, [artifacts, appendOutput, conversationId]);

  return {
    files,
    previewUrl,
    terminalOutput,
    progress,
    error,
    isBooting,
    selectedFile,
    setSelectedFile,
  };
}
