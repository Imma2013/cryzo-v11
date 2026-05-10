"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { ArtifactAction, FileMap } from "@/lib/workspace/types";

export function useWorkspace(conversationId: Id<"conversations">) {
  const [files, setFiles] = useState<FileMap>({});
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const bootedRef = useRef(false);

  const artifacts = useQuery(api.artifacts.listByConversation, {
    conversationId,
  });

  const appendOutput = useCallback((data: string) => {
    setTerminalOutput((prev) => prev + data);
  }, []);

  const handleServerReady = useCallback((url: string) => {
    setPreviewUrl(url);
  }, []);

  useEffect(() => {
    if (!artifacts || artifacts.length === 0 || bootedRef.current) return;
    bootedRef.current = true;

    const boot = async () => {
      const { getWebContainer } = await import("@/lib/workspace/webcontainer");
      const { runActions } = await import("@/lib/workspace/action-runner");

      setIsBooting(true);
      appendOutput("Booting WebContainer...\r\n");

      const wc = await getWebContainer();
      appendOutput("WebContainer ready.\r\n");

      const allActions: ArtifactAction[] = artifacts.flatMap((a) => a.actions);

      // Build file map for the file tree
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

      await runActions(wc, allActions, appendOutput, handleServerReady);
      setIsBooting(false);
    };

    boot().catch((err) => {
      appendOutput(`\r\nError: ${err.message}\r\n`);
      setIsBooting(false);
    });
  }, [artifacts, appendOutput, handleServerReady, selectedFile]);

  return {
    files,
    previewUrl,
    terminalOutput,
    isBooting,
    selectedFile,
    setSelectedFile,
  };
}
