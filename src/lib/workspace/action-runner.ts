import type { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";
import {
  getInstalledPackageManifest,
  markInstalledPackageManifest,
  runCommand,
  setActiveDevProcess,
  writeFiles,
} from "./webcontainer";

export type ProgressStage = "writing" | "installing" | "starting" | "ready" | "error";

async function nodeModulesExist(wc: WebContainer): Promise<boolean> {
  try {
    const entries = await wc.fs.readdir("node_modules");
    return entries.length > 0;
  } catch {
    return false;
  }
}

function packageManifestFromActions(actions: ArtifactAction[]) {
  return (
    actions.find(
      (action) =>
        action.type === "file" &&
        action.filePath?.replace(/^\.\//, "") === "package.json",
    )?.content ?? null
  );
}

function isNpmInstall(command: string) {
  return /^\s*npm\s+(?:install|i)(?:\s|$)/.test(command);
}

function isBareNpmInstall(command: string) {
  const parts = command.trim().split(/\s+/);
  if (parts[0] !== "npm" || !["install", "i"].includes(parts[1] ?? "")) {
    return false;
  }

  // `npm install` plus flags is a dependency sync. `npm install foo` is an
  // explicit package addition and must never be skipped.
  return parts.slice(2).every((part) => part.startsWith("-"));
}

function fasterNpmInstall(command: string) {
  if (!isNpmInstall(command)) return command;

  const flags = ["--prefer-offline", "--no-audit", "--no-fund"];
  const missing = flags.filter((flag) => !command.includes(flag));
  return missing.length > 0 ? `${command} ${missing.join(" ")}` : command;
}

async function readCurrentPackageManifest(wc: WebContainer) {
  try {
    return await wc.fs.readFile("package.json", "utf-8");
  } catch {
    return null;
  }
}

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
  const packageManifest = packageManifestFromActions(fileActions);

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

  // 3. Run shell commands. A warm WebContainer keeps node_modules around,
  // so a bare npm install can be skipped when package.json is unchanged.
  if (shellActions.some((action) => isNpmInstall(action.content))) {
    onProgress("installing");
  }

  for (const action of shellActions) {
    const installCommand = isNpmInstall(action.content);
    const canReuseDependencies =
      installCommand &&
      isBareNpmInstall(action.content) &&
      packageManifest !== null &&
      getInstalledPackageManifest() === packageManifest &&
      (await nodeModulesExist(wc));

    if (canReuseDependencies) {
      onOutput("Dependencies unchanged — reusing installed node_modules.\r\n\r\n");
      continue;
    }

    const command = installCommand ? fasterNpmInstall(action.content) : action.content;
    onOutput(`$ ${command}\r\n`);

    try {
      const exitCode = await runCommand(wc, command, onOutput);
      if (exitCode !== 0) {
        onOutput(`\r\nExited with code ${exitCode}\r\n`);
        onProgress("error");
        return;
      }

      if (installCommand) {
        markInstalledPackageManifest(await readCurrentPackageManifest(wc));
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
    setActiveDevProcess(process);

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          onOutput(data);
        },
      })
    ).catch(() => {});
  } else if (!serverReadyFired) {
    onOutput("\r\nNo start command provided. Cannot start dev server.\r\n");
    onProgress("error");
  }
}
