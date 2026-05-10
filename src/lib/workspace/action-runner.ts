import type { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";
import { writeFiles, runCommand } from "./webcontainer";

export type ProgressStage = "writing" | "installing" | "starting" | "ready" | "error";

export async function runActions(
  wc: WebContainer,
  actions: ArtifactAction[],
  onOutput: (data: string) => void,
  onServerReady: (url: string) => void,
  onProgress: (stage: ProgressStage) => void
): Promise<void> {
  const fileActions = actions.filter((a) => a.type === "file");
  const shellActions = actions.filter((a) => a.type === "shell");
  const startActions = actions.filter((a) => a.type === "start");

  // 1. Write all files
  onProgress("writing");
  if (fileActions.length > 0) {
    onOutput(`Writing ${fileActions.length} files...\r\n`);
    await writeFiles(wc, fileActions);
    onOutput(`Done.\r\n\r\n`);
  }

  // 2. Listen for server-ready
  let serverReadyFired = false;
  wc.on("server-ready", (_port, url) => {
    serverReadyFired = true;
    onProgress("ready");
    onServerReady(url);
  });

  // 3. Run shell commands (npm install, etc.) — await each
  onProgress("installing");
  for (const action of shellActions) {
    onOutput(`$ ${action.content}\r\n`);
    try {
      const exitCode = await runCommand(wc, action.content, onOutput, 120000);
      if (exitCode !== 0) {
        onOutput(`\r\nExited with code ${exitCode}\r\n`);
        onProgress("error");
        return;
      }
      onOutput("\r\n");
    } catch (err: any) {
      onOutput(`\r\nError: ${err.message}\r\n`);
      onProgress("error");
      return;
    }
  }

  // 4. Start dev server (don't await — it runs indefinitely)
  if (startActions.length > 0) {
    onProgress("starting");
    const startCmd = startActions[0].content;
    onOutput(`$ ${startCmd}\r\n`);

    const parts = startCmd.trim().split(/\s+/);
    const cmd = parts.shift()!;
    const process = await wc.spawn(cmd, parts);

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          onOutput(data);
        },
      })
    );

    // Timeout: if server doesn't start in 60s, report error
    setTimeout(() => {
      if (!serverReadyFired) {
        onOutput("\r\nTimeout: dev server did not start within 60 seconds.\r\n");
        onProgress("error");
      }
    }, 60000);
  } else if (!serverReadyFired) {
    onOutput("\r\nNo start command provided. Cannot start dev server.\r\n");
    onProgress("error");
  }
}
