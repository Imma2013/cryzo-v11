import { WebContainer, type FileSystemTree } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

const WORKSPACES_ROOT = ".cryzo-workspaces";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let activeWorkspaceId: string | null = null;
let activeWorkspacePath: string | null = null;
let activeDevProcess: { kill: () => void } | null = null;

// Runtime caches are scoped per conversation. One chat can never poison or
// overwrite another chat's files/node_modules just because they share a single
// warm WebContainer process.
const installedPackageManifests = new Map<string, string | null>();
const hydratedWorkspaceSignatures = new Map<string, string>();

function safeWorkspaceId(workspaceId: string) {
  return workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function workspacePathFor(workspaceId: string) {
  return `${WORKSPACES_ROOT}/${safeWorkspaceId(workspaceId)}`;
}

function normalizeRelativePath(path: string) {
  return path.replace(/^\.\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
}

async function bootWebContainer(): Promise<WebContainer> {
  const wc = await WebContainer.boot({
    coep: "credentialless",
    forwardPreviewErrors: true,
  });

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

  // Bolt-style singleton: boot once per browser session. WebContainer boot is
  // expensive, so UI remounts should never create a second runtime.
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
): Promise<string> {
  if (activeWorkspaceId !== workspaceId) {
    try {
      activeDevProcess?.kill();
    } catch {}
    activeDevProcess = null;
  }

  const workspacePath = workspacePathFor(workspaceId);
  await wc.fs.mkdir(WORKSPACES_ROOT, { recursive: true });
  await wc.fs.mkdir(workspacePath, { recursive: true });

  activeWorkspaceId = workspaceId;
  activeWorkspacePath = workspacePath;
  return workspacePath;
}

export function getActiveWorkspacePath() {
  if (!activeWorkspacePath) {
    throw new Error("No active Cryzo workspace");
  }
  return activeWorkspacePath;
}

function actionsToFileSystemTree(actions: ArtifactAction[]): FileSystemTree {
  const tree: Record<string, any> = {};

  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;

    const path = normalizeRelativePath(action.filePath);
    if (!path) continue;

    const parts = path.split("/");
    let cursor = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const existing = cursor[part];
      if (!existing || !existing.directory) {
        cursor[part] = { directory: {} };
      }
      cursor = cursor[part].directory;
    }

    cursor[parts[parts.length - 1]] = {
      file: { contents: action.content },
    };
  }

  return tree as FileSystemTree;
}

async function clearWorkspaceSource(
  wc: WebContainer,
  workspacePath: string,
): Promise<void> {
  let entries: string[] = [];
  try {
    entries = await wc.fs.readdir(workspacePath);
  } catch {
    return;
  }

  for (const entry of entries) {
    // Keep this chat's dependencies warm. Everything else is disposable source
    // that can be replaced from the authenticated Convex snapshot/artifacts.
    if (entry === "node_modules") continue;
    try {
      await wc.fs.rm(`${workspacePath}/${entry}`, {
        recursive: true,
        force: true,
      });
    } catch {}
  }
}

export async function hydrateWorkspace(
  wc: WebContainer,
  workspaceId: string,
  fileActions: ArtifactAction[],
  signature: string,
): Promise<{ reused: boolean; path: string }> {
  const workspacePath = await prepareWorkspace(wc, workspaceId);

  if (hydratedWorkspaceSignatures.get(workspaceId) === signature) {
    try {
      await wc.fs.readdir(workspacePath);
      return { reused: true, path: workspacePath };
    } catch {
      hydratedWorkspaceSignatures.delete(workspaceId);
    }
  }

  await clearWorkspaceSource(wc, workspacePath);

  const tree = actionsToFileSystemTree(fileActions);
  if (Object.keys(tree).length > 0) {
    // WebContainers recommends mount() for bulk page-load hydration. It avoids
    // sequential writeFile churn and mounts only inside this chat's directory.
    await wc.mount(tree, { mountPoint: workspacePath });
  }

  hydratedWorkspaceSignatures.set(workspaceId, signature);
  return { reused: false, path: workspacePath };
}

async function ensureWorkspaceDirectory(
  wc: WebContainer,
  relativeDir: string,
): Promise<void> {
  if (!relativeDir) return;

  const base = getActiveWorkspacePath();
  const parts = normalizeRelativePath(relativeDir).split("/").filter(Boolean);
  let current = base;

  for (const part of parts) {
    current = `${current}/${part}`;
    try {
      await wc.fs.mkdir(current);
    } catch {
      // Existing directory is fine. If a stale file occupies the directory
      // path, replace only that path inside the current chat workspace.
      try {
        await wc.fs.readdir(current);
        continue;
      } catch {}

      try {
        await wc.fs.rm(current, { recursive: true, force: true });
      } catch {}
      await wc.fs.mkdir(current);
    }
  }
}

export function getInstalledPackageManifest() {
  if (!activeWorkspaceId) return null;
  return installedPackageManifests.get(activeWorkspaceId) ?? null;
}

export function markInstalledPackageManifest(manifest: string | null) {
  if (!activeWorkspaceId) return;
  installedPackageManifests.set(activeWorkspaceId, manifest);
}

export function setActiveDevProcess(process: { kill: () => void } | null) {
  if (activeDevProcess && activeDevProcess !== process) {
    try {
      activeDevProcess.kill();
    } catch {}
  }
  activeDevProcess = process;
}

export async function spawnWorkspaceProcess(
  wc: WebContainer,
  command: string,
  args: string[],
) {
  return await wc.spawn(command, args, { cwd: getActiveWorkspacePath() });
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
  activeWorkspacePath = null;
  installedPackageManifests.clear();
  hydratedWorkspaceSignatures.clear();
}

export async function writeFiles(wc: WebContainer, actions: ArtifactAction[]) {
  const base = getActiveWorkspacePath();

  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;

    const relativePath = normalizeRelativePath(action.filePath);
    const parts = relativePath.split("/");
    if (parts.length > 1) {
      await ensureWorkspaceDirectory(wc, parts.slice(0, -1).join("/"));
    }

    const targetPath = `${base}/${relativePath}`;
    try {
      await wc.fs.writeFile(targetPath, action.content);
    } catch {
      // Handle file<->directory shape changes from later AI edits without ever
      // touching another conversation's workspace.
      try {
        await wc.fs.rm(targetPath, { recursive: true, force: true });
      } catch {}
      await wc.fs.writeFile(targetPath, action.content);
    }
  }
}

export async function runCommand(
  wc: WebContainer,
  command: string,
  onOutput: (data: string) => void,
): Promise<number> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts.shift()!;
  const process = await spawnWorkspaceProcess(wc, cmd, parts);

  const outputPromise = process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    }),
  );

  const exitCode = await process.exit;
  await outputPromise.catch(() => {});
  return exitCode;
}
