"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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

  // Reset state when conversation changes (but keep WebContainer alive)
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

  // Track which artifacts have been applied
  const appliedArtifactsRef = useRef<Set<string>>(new Set());

  // Initial boot — only runs once
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
        const bootTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("WebContainer boot timed out after 30s. Try refreshing the page.")), 30000)
        );
        const wc = await Promise.race([getWebContainer(), bootTimeout]);
        appendOutput("WebContainer ready.\r\n\r\n");

        const allActions: ArtifactAction[] = artifacts.flatMap((a) => a.actions);

        // Mark all current artifacts as applied
        for (const a of artifacts) {
          appliedArtifactsRef.current.add(a._id);
        }

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

  // Apply NEW artifacts after initial boot (edits/updates)
  useEffect(() => {
    if (!artifacts || !bootedRef.current) return;

    const newArtifacts = artifacts.filter(
      (a) => !appliedArtifactsRef.current.has(a._id)
    );
    if (newArtifacts.length === 0) return;

    // Mark as applied immediately to prevent double-apply
    for (const a of newArtifacts) {
      appliedArtifactsRef.current.add(a._id);
    }

    const applyUpdates = async () => {
      const { getWebContainer, writeFiles } = await import(
        "@/lib/workspace/webcontainer"
      );

      try {
        const wc = await getWebContainer();
        const fileActions = newArtifacts.flatMap((a) =>
          a.actions.filter(
            (act): act is ArtifactAction & { filePath: string } =>
              act.type === "file" && !!act.filePath
          )
        );

        if (fileActions.length > 0) {
          appendOutput(`\r\nApplying ${fileActions.length} file update(s)...\r\n`);
          await writeFiles(wc, fileActions);
          appendOutput("Done. HMR should refresh.\r\n");

          // Update file map
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

        // Run shell commands if any (e.g., new dependency installs)
        const shellActions = newArtifacts.flatMap((a) =>
          a.actions.filter((act) => act.type === "shell")
        );
        if (shellActions.length > 0) {
          const { runCommand } = await import("@/lib/workspace/webcontainer");
          for (const action of shellActions) {
            appendOutput(`\r\n$ ${action.content}\r\n`);
            await runCommand(wc, action.content, appendOutput);
          }
        }
      } catch (err: any) {
        appendOutput(`\r\nError applying update: ${err.message}\r\n`);
      }
    };

    applyUpdates();
  }, [artifacts, appendOutput]);

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
