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
  const [progress, setProgress] = useState<ProgressStage>("preparing");
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

  // Convex is the durable source of truth. The snapshot gives us the latest
  // complete project, while persisted artifact writes are replayed on top so a
  // just-finished edit wins even if snapshot persistence is still catching up.
  const restoredFileMap = useMemo<FileMap>(() => {
    const fileMap: FileMap = {};

    for (const file of snapshot?.files ?? []) {
      addFileToMap(fileMap, file.path, file.content);
    }

    for (const action of allArtifactActions) {
      if (action.type === "file" && action.filePath) {
        addFileToMap(fileMap, action.filePath, action.content);
      }
    }

    return fileMap;
  }, [snapshot?.files, allArtifactActions]);

  const snapshotFiles = useMemo(
    () => fileMapToSnapshotFiles(restoredFileMap),
    [restoredFileMap],
  );
  const workspaceSignature = useMemo(
    () => JSON.stringify(snapshotFiles),
    [snapshotFiles],
  );

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

  const packageManifest =
    restoredFileMap["package.json"]?.type === "file"
      ? restoredFileMap["package.json"].content ?? null
      : null;

  useEffect(() => {
    if (conversationId !== convIdRef.current) {
      convIdRef.current = conversationId;
      bootedRef.current = false;
      appliedArtifactsRef.current = new Set();
      snapshotSignatureRef.current = "";
      setFiles({});
      setPreviewUrl(null);
      setTerminalOutput("");
      setProgress("preparing");
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
      setError("Preview runtime failed. Check the terminal output for details.");
      setIsBooting(false);
    }
    if (stage === "ready") {
      setIsBooting(false);
    }
  }, []);

  const appliedArtifactsRef = useRef<Set<string>>(new Set());

  // The Code tab is populated directly from Convex. This is independent of the
  // WebContainer lifecycle, so saved files never disappear while preview boots.
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

  // Backfill older chats and keep one complete authenticated workspace snapshot
  // in Convex. Existing artifact history remains intact as the audit/history log.
  useEffect(() => {
    if (artifacts === undefined || snapshot === undefined) return;
    if (snapshotFiles.length === 0) return;

    const runtimePayload = runtimeActions
      .filter(
        (action): action is ArtifactAction & { type: "shell" | "start" } =>
          action.type === "shell" || action.type === "start",
      )
      .map((action) => ({ type: action.type, content: action.content }));
    const desiredSignature = JSON.stringify({
      files: snapshotFiles,
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
      files: snapshotFiles,
      runtimeActions: runtimePayload,
    }).catch(() => {
      if (snapshotSignatureRef.current === desiredSignature) {
        snapshotSignatureRef.current = "";
      }
    });
  }, [
    artifacts,
    conversationId,
    runtimeActions,
    saveWorkspaceSnapshot,
    snapshot,
    snapshotFiles,
  ]);

  // Preview hydration is intentionally separate from persistence. Each chat is
  // mounted into its own directory inside the one warm WebContainer, matching
  // the old working behavior (projects cannot overwrite each other) while still
  // retaining the boot/npm-cache speedups added today.
  useEffect(() => {
    if (artifacts === undefined || snapshot === undefined || bootedRef.current) {
      return;
    }
    if (snapshotFiles.length === 0) return;

    bootedRef.current = true;
    const bootConversationId = conversationId;

    for (const artifact of artifacts) {
      appliedArtifactsRef.current.add(artifact._id);
    }

    const fileActions = fileMapToActions(restoredFileMap);

    const boot = async () => {
      const { getWebContainer, hydrateWorkspace } = await import(
        "@/lib/workspace/webcontainer"
      );
      const { runActions } = await import("@/lib/workspace/action-runner");

      setIsBooting(true);
      setError(null);
      setProgress("preparing");
      appendOutput("Preparing saved project...\r\n");

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

        const hydration = await hydrateWorkspace(
          wc,
          String(bootConversationId),
          fileActions,
          workspaceSignature,
        );
        appendOutput(
          hydration.reused
            ? "Saved project already hydrated.\r\n\r\n"
            : "Saved project mounted.\r\n\r\n",
        );

        if (convIdRef.current !== bootConversationId) return;

        // Files are already mounted. runActions only reconciles dependencies and
        // starts the dev server, so reopening a saved chat never shows a fake
        // "Writing files" phase.
        await runActions(
          wc,
          runtimeActions,
          appendOutput,
          handleServerReady,
          handleProgress,
          {
            filesAlreadyPrepared: true,
            packageManifest,
          },
        );

        if (convIdRef.current === bootConversationId) {
          setInitialBootFinished(true);
        }
      } catch (err: any) {
        if (convIdRef.current !== bootConversationId) return;
        appendOutput(`\r\nFatal error: ${err.message}\r\n`);
        setError(err.message);
        setProgress("error");
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
    packageManifest,
    restoredFileMap,
    runtimeActions,
    snapshot,
    snapshotFiles.length,
    workspaceSignature,
  ]);

  // Later AI edits are incremental writes inside only this conversation's
  // isolated directory. Other chats and their dependencies are untouched.
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
      const { getWebContainer, prepareWorkspace, writeFiles } = await import(
        "@/lib/workspace/webcontainer"
      );

      try {
        const wc = await getWebContainer();
        if (convIdRef.current !== conversationId) return;
        await prepareWorkspace(wc, String(conversationId));

        const fileActions = newArtifacts.flatMap((artifact) =>
          artifact.actions.filter(
            (action): action is ArtifactAction & { filePath: string } =>
              action.type === "file" && !!action.filePath,
          ),
        );

        if (fileActions.length > 0) {
          appendOutput(`\r\nUpdating ${fileActions.length} file(s)...\r\n`);
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
