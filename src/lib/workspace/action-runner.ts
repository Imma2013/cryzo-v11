import type { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";
import { writeFiles, runCommand } from "./webcontainer";

export async function runActions(
  wc: WebContainer,
  actions: ArtifactAction[],
  onOutput: (data: string) => void,
  onServerReady: (url: string) => void
): Promise<void> {
  const fileActions = actions.filter((a) => a.type === "file");
  const shellActions = actions.filter((a) => a.type === "shell");
  const startActions = actions.filter((a) => a.type === "start");

  // Write all files first
  if (fileActions.length > 0) {
    onOutput("Writing files...\r\n");
    await writeFiles(wc, fileActions);
    onOutput(`Wrote ${fileActions.length} files.\r\n`);
  }

  // Listen for server-ready before running start commands
  wc.on("server-ready", (_port, url) => {
    onServerReady(url);
  });

  // Run shell commands sequentially
  for (const action of shellActions) {
    onOutput(`\r\n$ ${action.content}\r\n`);
    const exitCode = await runCommand(wc, action.content, onOutput);
    if (exitCode !== 0) {
      onOutput(`\r\nCommand exited with code ${exitCode}\r\n`);
    }
  }

  // Start dev server
  for (const action of startActions) {
    onOutput(`\r\n$ ${action.content}\r\n`);
    runCommand(wc, action.content, onOutput);
  }
}
