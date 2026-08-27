import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let activeWorkspaceId: string | null = null;
let installedPackageManifest: string | null = null;
let activeDevProcess: { kill: () => void } | null = null;

async function bootWebContainer(): Promise<WebContainer> {
  const wc = await WebContainer.boot({ coep: "credentialless" });

  // Inject inspector script into all preview iframes once per browser session.
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

  // Bolt-style singleton promise: every caller awaits the same cold boot rather
  // than polling and risking another boot after a UI remount.
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
  wc: WebContainer,
  workspaceId: string,
): Promise<void> {
  if (activeWorkspaceId === workspaceId) return;

  // A new conversation can reuse the expensive WebContainer + npm cache, but
  // should not inherit the previous app's source files or running dev server.
  if (activeWorkspaceId !== null) {
    try {
      activeDevProcess?.kill();
    } catch {}
    activeDevProcess = null;

    try {
      const entries = await wc.fs.readdir(".");
      for (const entry of entries) {
        // Keep node_modules around. The action runner fingerprints package.json
        // and will reconcile dependencies only when the manifest changes.
        if (entry === "node_modules") continue;
        try {
          await wc.fs.rm(entry, { recursive: true, force: true });
        } catch {}
      }
    } catch {}
  }

  activeWorkspaceId = workspaceId;
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
