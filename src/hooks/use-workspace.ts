"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { ArtifactAction, FileMap } from "@/lib/workspace/types";
import type { ProgressStage } from "@/lib/workspace/action-runner";

function addFileToMap(fileMap: FileMap, filePath: string, content: string) {
  fileMap[filePath] = { type: "file", content };
  const parts = filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (!fileMap[dir]) fileMap[dir] = { type: "folder" };
  }
}

function fileMapToSnapshotFiles(fileMap: FileMap) {
  return Object.entries(fileMap)
    .filter(([, entry]) => entry.type === "file")
    .map(([path, entry]) => ({ path, content: entry.content ?? "" }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function fileMapToActions(fileMap: FileMap): ArtifactAction[] {
  return fileMapToSnapshotFiles(fileMap).map(({ path, content }) => ({
    type: "file" as const,
    filePath: path,
    content,
  }));
}

export function useWorkspace(conversationId: Id<"conversations">) {
  const [files, setFiles] = useState<FileMap>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [progress, setProgress] = useState<ProgressStage>("writing");
  const [error, setError] = useState<string | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [initialBootFinished, setInitialBootFinished] = useState(false);
  const bootedRef = useRef(false);
  const convIdRef = useRef(conversationId);
  const snapshotSignatureRef = useRef("");

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId,
  });
  const snapshot = useQuery(api.artifacts.getWorkspaceSnapshot, {
    conversationId,
  });
  const saveWorkspaceSnapshot = useMutation(api.artifacts.saveWorkspaceSnapshot);

  const allArtifactActions = useMemo<ArtifactAction[]>(
    () => artifacts?.flatMap((artifact) => artifact.actions) ?? [],
    [artifacts],
  );

  const restoredFileMap = useMemo<FileMap>(() => {
    const fileMap: FileMap = {};

    // Bolt-style restore: the persisted snapshot is the baseline filesystem.
    // Convex is the source of truth here, not the live WebContainer instance.
    for (const file of snapshot?.files ?? []) {
      addFileToMap(fileMap, file.path, file.content);
    }

    // Replay persisted artifact writes over the snapshot so a just-created
    // artifact always wins even if the snapshot mutation is still catching up.
    for (const action of allArtifactActions) {
      if (action.type === "file" && action.filePath) {
        addFileToMap(fileMap, action.filePath, action.content);
      }
    }

    return fileMap;
  }, [snapshot?.files, allArtifactActions]);

  const runtimeActions = useMemo<ArtifactAction[]>(() => {
    const persistedRuntime = allArtifactActions.filter(
      (action) => action.type === "shell" || action.type === "start",
    );

    if (persistedRuntime.length > 0) return persistedRuntime;

    return (snapshot?.runtimeActions ?? []).map((action) => ({
      type: action.type,
      content: action.content,
    }));
  }, [allArtifactActions, snapshot?.runtimeActions]);

  // Reset React state when conversation changes. The WebContainer stays warm,
  // while every conversation's actual project state stays persisted in Convex.
  useEffect(() => {
    if (conversationId !== convIdRef.current) {
      convIdRef.current = conversationId;
      bootedRef.current = false;
      appliedArtifactsRef.current = new Set();
      snapshotSignatureRef.current = "";
      setFiles({});
      setPreviewUrl(null);
      setTerminalOutput("");
      setProgress("writing");
      setError(null);
      setIsBooting(true);
      setInitialBootFinished(false);
      setSelectedFile(null);
    }
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

  // Track which artifacts have been applied to the currently running project.
  const appliedArtifactsRef = useRef<Set<string>>(new Set());

  // Populate the Code tab immediately from persisted Convex state. Do this
  // before waiting on WebContainer cleanup/boot/install so old chats never look
  // like their source files were deleted while the runtime is preparing.
  useEffect(() => {
    if (artifacts === undefined || snapshot === undefined) return;

    setFiles(restoredFileMap);
    setSelectedFile((current) => {
      if (current && restoredFileMap[current]?.type === "file") return current;
      return (
        Object.keys(restoredFileMap).find(
          (path) => restoredFileMap[path]?.type === "file",
        ) ?? null
      );
    });
  }, [artifacts, snapshot, restoredFileMap]);

  // Backfill and continually refresh a complete filesystem snapshot in Convex.
  // This is the server-backed equivalent of bolt.diy's local snapshot restore,
  // and it means a past chat can recover independently of WebContainer memory.
  useEffect(() => {
    if (artifacts === undefined || snapshot === undefined) return;
    if (Object.keys(restoredFileMap).length === 0) return;

    const filesPayload = fileMapToSnapshotFiles(restoredFileMap);
    const runtimePayload = runtimeActions
      .filter(
        (action): action is ArtifactAction & { type: "shell" | "start" } =>
          action.type === "shell" || action.type === "start",
      )
      .map((action) => ({ type: action.type, content: action.content }));
    const desiredSignature = JSON.stringify({
      files: filesPayload,
      runtimeActions: runtimePayload,
    });
    const storedSignature = JSON.stringify({
      files: [...(snapshot?.files ?? [])].sort((a, b) =>
        a.path.localeCompare(b.path),
      ),
      runtimeActions: snapshot?.runtimeActions ?? [],
    });

    if (desiredSignature === storedSignature) {
      snapshotSignatureRef.current = desiredSignature;
      return;
    }
    if (snapshotSignatureRef.current === desiredSignature) return;

    snapshotSignatureRef.current = desiredSignature;
    void saveWorkspaceSnapshot({
      conversationId,
      files: filesPayload,
      runtimeActions: runtimePayload,
    }).catch(() => {
      if (snapshotSignatureRef.current === desiredSignature) {
        snapshotSignatureRef.current = "";
      }
    });
  }, [
    artifacts,
    conversationId,
    restoredFileMap,
    runtimeActions,
    saveWorkspaceSnapshot,
    snapshot,
  ]);

  // Initial restore/boot. Persisted files are already visible in React before
  // this starts. The runtime is disposable; Convex is the durable workspace.
  useEffect(() => {
    if (artifacts === undefined || snapshot === undefined || bootedRef.current) {
      return;
    }
    if (Object.keys(restoredFileMap).length === 0) return;

    bootedRef.current = true;
    const bootConversationId = conversationId;

    // Mark the artifacts included in this restore before doing async work. This
    // prevents the update effect from racing the initial restore and writing the
    // same files while a conversation switch is being prepared.
    for (const artifact of artifacts) {
      appliedArtifactsRef.current.add(artifact._id);
    }

    const actionsForRestore: ArtifactAction[] = [
      ...fileMapToActions(restoredFileMap),
      ...runtimeActions,
    ];

    const boot = async () => {
      const { getWebContainer, prepareWorkspace } = await import(
        "@/lib/workspace/webcontainer"
      );
      const { runActions } = await import("@/lib/workspace/action-runner");

      setIsBooting(true);
      setError(null);
      appendOutput("Restoring saved workspace...\r\n");

      try {
        const bootTimeout = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "WebContainer boot timed out after 30s. Try refreshing the page.",
                ),
              ),
            30000,
          ),
        );
        const wc = await Promise.race([getWebContainer(), bootTimeout]);

        if (convIdRef.current !== bootConversationId) return;

        await prepareWorkspace(wc, String(bootConversationId));
        appendOutput("Saved files restored. Starting runtime...\r\n\r\n");

        await runActions(
          wc,
          actionsForRestore,
          appendOutput,
          handleServerReady,
          handleProgress,
        );

        if (convIdRef.current === bootConversationId) {
          setInitialBootFinished(true);
        }
      } catch (err: any) {
        if (convIdRef.current !== bootConversationId) return;
        appendOutput(`\r\nFatal error: ${err.message}\r\n`);
        setError(err.message);
        setIsBooting(false);
      }
    };

    void boot();
  }, [
    appendOutput,
    artifacts,
    conversationId,
    handleProgress,
    handleServerReady,
    restoredFileMap,
    runtimeActions,
    snapshot,
  ]);

  // Apply artifacts created after the restored snapshot/initial boot. Waiting
  // for initialBootFinished avoids the old race where a second writer could run
  // while the restore path was still clearing/preparing the WebContainer.
  useEffect(() => {
    if (!artifacts || !initialBootFinished) return;

    const newArtifacts = artifacts.filter(
      (artifact) => !appliedArtifactsRef.current.has(artifact._id),
    );
    if (newArtifacts.length === 0) return;

    for (const artifact of newArtifacts) {
      appliedArtifactsRef.current.add(artifact._id);
    }

    const applyUpdates = async () => {
      const { getWebContainer, writeFiles } = await import(
        "@/lib/workspace/webcontainer"
      );

      try {
        const wc = await getWebContainer();
        if (convIdRef.current !== conversationId) return;

        const fileActions = newArtifacts.flatMap((artifact) =>
          artifact.actions.filter(
            (action): action is ArtifactAction & { filePath: string } =>
              action.type === "file" && !!action.filePath,
          ),
        );

        if (fileActions.length > 0) {
          appendOutput(`\r\nWriting ${fileActions.length} file(s)...\r\n`);
          await writeFiles(wc, fileActions);
          appendOutput("Done. HMR should refresh.\r\n");
        }

        const shellActions = newArtifacts.flatMap((artifact) =>
          artifact.actions.filter(
            (action) =>
              action.type === "shell" &&
              !/^\s*npm\s+(?:install|i)(?:\s|$)/.test(action.content),
          ),
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

    void applyUpdates();
  }, [artifacts, initialBootFinished, appendOutput, conversationId]);

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
