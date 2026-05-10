"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { ArtifactAction, FileMap } from "@/lib/workspace/types";
import type { ProgressStage } from "@/lib/workspace/action-runner";

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

  // Reset when conversation changes
  useEffect(() => {
    if (conversationId !== convIdRef.current) {
      convIdRef.current = conversationId;
      bootedRef.current = false;
      setFiles({});
      setPreviewUrl(null);
      setTerminalOutput("");
      setProgress("writing");
      setError(null);
      setIsBooting(true);
      setSelectedFile(null);

      import("@/lib/workspace/webcontainer").then(({ teardownWebContainer }) => {
        teardownWebContainer();
      });
    }
  }, [conversationId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      import("@/lib/workspace/webcontainer").then(({ teardownWebContainer }) => {
        teardownWebContainer();
      });
    };
  }, []);

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

  useEffect(() => {
    if (!artifacts || artifacts.length === 0 || bootedRef.current) return;
    bootedRef.current = true;

    const boot = async () => {
      const { getWebContainer } = await import("@/lib/workspace/webcontainer");
      const { runActions } = await import("@/lib/workspace/action-runner");

      setIsBooting(true);
      setError(null);
      appendOutput("Booting WebContainer...\r\n");

      try {
        const wc = await getWebContainer();
        appendOutput("WebContainer ready.\r\n\r\n");

        const allActions: ArtifactAction[] = artifacts.flatMap((a) => a.actions);

        // Build file map
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

        if (!selectedFile) {
          const firstFile = allActions.find(
            (a) => a.type === "file" && a.filePath
          );
          if (firstFile?.filePath) setSelectedFile(firstFile.filePath);
        }

        await runActions(wc, allActions, appendOutput, handleServerReady, handleProgress);
      } catch (err: any) {
        appendOutput(`\r\nFatal error: ${err.message}\r\n`);
        setError(err.message);
        setIsBooting(false);
      }
    };

    boot();
  }, [artifacts, appendOutput, handleServerReady, handleProgress, selectedFile]);

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
