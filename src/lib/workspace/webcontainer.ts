import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let activeWorkspaceId: string | null = null;
let installedPackageManifest: string | null = null;
let activeDevProcess: { kill: () => void } | null = null;

async function bootWebContainer(): Promise<WebContainer> {
  const wc = await WebContainer.boot({ coep: "credentialless" });

  try {
    const res = await fetch("/inspector-script.js");
    const script = await res.text();
    await wc.setPreviewScript(script);
  } catch {
    // Preview still works if the optional inspector script cannot be loaded.
  }

  instance = wc;
  return wc;
}

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;

  if (!bootPromise) {
    bootPromise = bootWebContainer();
  }

  try {
    return await bootPromise;
  } catch (error) {
    bootPromise = null;
    throw error;
  }
}

export function prewarmWebContainer() {
  return getWebContainer();
}

export async function prepareWorkspace(
  _wc: WebContainer,
  workspaceId: string,
): Promise<void> {
  if (activeWorkspaceId === workspaceId) return;

  // Switching conversations should stop the previous dev server, but it must
  // never erase the old source tree before the target conversation has been
  // restored. Persisted Convex state is restored first; stale files are pruned
  // only after the target files have been written.
  try {
    activeDevProcess?.kill();
  } catch {}
  activeDevProcess = null;
  activeWorkspaceId = workspaceId;
}

function normalizePath(path: string) {
  return path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

export async function pruneWorkspaceFiles(
  wc: WebContainer,
  actions: ArtifactAction[],
): Promise<void> {
  const desiredFiles = new Set<string>();
  const desiredDirs = new Set<string>();

  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;
    const filePath = normalizePath(action.filePath);
    desiredFiles.add(filePath);

    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      desiredDirs.add(parts.slice(0, i).join("/"));
    }
  }

  const pruneDir = async (dir: string) => {
    let entries: string[];
    try {
      entries = await wc.fs.readdir(dir || ".");
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!dir && entry === "node_modules") continue;

      const path = normalizePath(dir ? `${dir}/${entry}` : entry);
      let isDirectory = false;
      try {
        await wc.fs.readdir(path);
        isDirectory = true;
      } catch {
        isDirectory = false;
      }

      if (isDirectory) {
        if (!desiredDirs.has(path)) {
          try {
            await wc.fs.rm(path, { recursive: true, force: true });
          } catch {}
          continue;
        }
        await pruneDir(path);
        continue;
      }

      if (!desiredFiles.has(path)) {
        try {
          await wc.fs.rm(path, { force: true });
        } catch {}
      }
    }
  };

  await pruneDir("");
}

export function getInstalledPackageManifest() {
  return installedPackageManifest;
}

export function markInstalledPackageManifest(manifest: string | null) {
  installedPackageManifest = manifest;
}

export function setActiveDevProcess(process: { kill: () => void } | null) {
  if (activeDevProcess && activeDevProcess !== process) {
    try {
      activeDevProcess.kill();
    } catch {}
  }
  activeDevProcess = process;
}

export async function teardownWebContainer() {
  try {
    activeDevProcess?.kill();
  } catch {}
  activeDevProcess = null;

  if (instance) {
    instance.teardown();
    instance = null;
  }

  bootPromise = null;
  activeWorkspaceId = null;
  installedPackageManifest = null;
}

export async function writeFiles(wc: WebContainer, actions: ArtifactAction[]) {
  for (const action of actions) {
    if (action.type === "file" && action.filePath) {
      const parts = action.filePath.split("/");
      if (parts.length > 1) {
        const dir = parts.slice(0, -1).join("/");
        await wc.fs.mkdir(dir, { recursive: true });
      }
      await wc.fs.writeFile(action.filePath, action.content);
    }
  }
}

export async function runCommand(
  wc: WebContainer,
  command: string,
  onOutput: (data: string) => void
): Promise<number> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts.shift()!;
  const process = await wc.spawn(cmd, parts);

  const outputPromise = process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    })
  );

  const exitCode = await process.exit;
  await outputPromise.catch(() => {});
  return exitCode;
}
