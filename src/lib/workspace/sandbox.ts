import type { Vivari } from "@vivari/core";
import type { ArtifactAction } from "./types";

/**
 * Cryzo's in-browser project runtime, backed by Vivari (MIT, https://vivari.run).
 *
 * The Vivari SDK is NOT bundled by Next.js. `scripts/sync-vivari-assets.mjs`
 * copies the published, self-contained ESM build to `public/vivari/` and its
 * preview Service Worker to `public/sw.js`; this module loads it with a native
 * dynamic import so the kernel's nested Web Workers resolve same-origin.
 */

export const SANDBOX_RELOAD_ERROR_CODE = "SANDBOX_RELOAD_REQUIRED";
export const SANDBOX_PROJECT_DIR = "/cryzo-project";

const VIVARI_ENTRY: string = "/vivari/index.js";
const VIVARI_SERVICE_WORKER = "/sw.js";

type VivariModule = typeof import("@vivari/core");

export type PreviewMessage = {
  type: "PREVIEW_UNCAUGHT_EXCEPTION" | "PREVIEW_UNHANDLED_REJECTION";
  message?: string;
  stack?: string;
};

type SandboxEventMap = {
  "server-ready": (port: number, url: string) => void;
  "preview-message": (message: PreviewMessage) => void;
};

export interface SandboxProcess {
  output: ReadableStream<string>;
  input: WritableStream<string>;
  exit: Promise<number>;
  kill(): void;
}

export interface SandboxDirEnt {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

function resolvePath(path: string) {
  if (path.startsWith("/")) return path;
  const clean = path.replace(/^\.\//, "").replace(/^\.$/, "");
  return clean ? `${SANDBOX_PROJECT_DIR}/${clean}` : SANDBOX_PROJECT_DIR;
}

export class Sandbox {
  private readonly previewListeners = new Set<SandboxEventMap["preview-message"]>();

  constructor(private readonly vivari: Vivari) {
    if (typeof window !== "undefined") {
      // Sent by public/inspector-script.js, which Vivari injects into every preview page.
      window.addEventListener("message", (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        const type = event.data?.type;
        if (type !== "PREVIEW_UNCAUGHT_EXCEPTION" && type !== "PREVIEW_UNHANDLED_REJECTION") return;
        for (const listener of this.previewListeners) listener(event.data as PreviewMessage);
      });
    }
  }

  /** Project-relative filesystem access (paths resolve inside the project dir). */
  readonly fs = {
    readFile: (path: string): Promise<Uint8Array> => this.vivari.fs.readFile(resolvePath(path)),
    readTextFile: (path: string): Promise<string> => this.vivari.fs.readFile(resolvePath(path), "utf-8"),
    writeFile: (path: string, contents: string | Uint8Array): Promise<void> =>
      this.vivari.fs.writeFile(resolvePath(path), contents),
    mkdir: (path: string): Promise<void> => this.vivari.fs.mkdir(resolvePath(path), { recursive: true }),
    rm: (path: string): Promise<void> =>
      this.vivari.fs.rm(resolvePath(path), { recursive: true, force: true }),
    exists: (path: string): Promise<boolean> => this.vivari.fs.exists(resolvePath(path)),
    readdir: (path: string): Promise<SandboxDirEnt[]> =>
      this.vivari.fs.readdir(resolvePath(path), { withFileTypes: true }),
  };

  on<E extends keyof SandboxEventMap>(event: E, listener: SandboxEventMap[E]): () => void {
    if (event === "server-ready") {
      return this.vivari.on("server-ready", listener as SandboxEventMap["server-ready"]);
    }
    const previewListener = listener as SandboxEventMap["preview-message"];
    this.previewListeners.add(previewListener);
    return () => this.previewListeners.delete(previewListener);
  }

  async spawn(
    command: string,
    args: string[] = [],
    options: { cwd?: string; env?: Record<string, string> } = {},
  ): Promise<SandboxProcess> {
    return this.vivari.spawn(command, args, {
      cwd: options.cwd ? resolvePath(options.cwd) : SANDBOX_PROJECT_DIR,
      env: options.env,
    });
  }

  /** Run a shell command line (pipes, `&&`, env assignments) inside the project. */
  spawnShell(commandLine: string, options: { cwd?: string; env?: Record<string, string> } = {}) {
    return this.spawn("sh", ["-c", commandLine], options);
  }

  /** Deliver dev-server HMR / SSE frames into a preview iframe. Returns a detach function. */
  attachPreview(frame: HTMLIFrameElement): () => void {
    return this.vivari.attachPreview(frame);
  }
}

let instance: Sandbox | null = null;
let bootPromise: Promise<Sandbox> | null = null;
let isolationFailure: Error | null = null;

function reloadRequiredError(message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = SANDBOX_RELOAD_ERROR_CODE;
  return error;
}

export function isSandboxReloadRequiredError(error: unknown) {
  if (!error) return false;
  const code = typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === SANDBOX_RELOAD_ERROR_CODE ||
    code === "ERR_NOT_ISOLATED" ||
    /cross.?origin.?isolat|SharedArrayBuffer|ERR_NOT_ISOLATED/i.test(message)
  );
}

function assertCrossOriginIsolation() {
  if (typeof window !== "undefined" && !window.crossOriginIsolated) {
    throw reloadRequiredError(
      "Cryzo needs to reload the builder before starting the live preview. Cross-origin isolation is not active in this document.",
    );
  }
}

async function bootSandbox(): Promise<Sandbox> {
  assertCrossOriginIsolation();
  const { Vivari: VivariRuntime } = (await import(
    /* webpackIgnore: true */ /* turbopackIgnore: true */ VIVARI_ENTRY
  )) as VivariModule;
  const vivari = await VivariRuntime.boot({
    serviceWorkerUrl: VIVARI_SERVICE_WORKER,
    workerName: "Cryzo Runtime",
    // Vivari's "devtools" slot injects /vv-devtools/chobitsu.js into every preview
    // page. Cryzo serves its own element picker + error reporter at that path
    // (see scripts/sync-vivari-assets.mjs), so no DevTools backend is loaded.
    devtools: true,
  });
  await vivari.fs.mkdir(SANDBOX_PROJECT_DIR, { recursive: true });
  return new Sandbox(vivari);
}

export async function getSandbox(): Promise<Sandbox> {
  if (instance) return instance;
  if (isolationFailure) throw isolationFailure;
  if (bootPromise) return bootPromise;

  bootPromise = bootSandbox()
    .then((sandbox) => {
      instance = sandbox;
      return sandbox;
    })
    .catch((error) => {
      // Unlike a missing isolation header, an ordinary boot failure (slow network,
      // worker load error) is retryable: clear the promise so the next call boots again.
      bootPromise = null;
      if (isSandboxReloadRequiredError(error)) {
        isolationFailure =
          (error as { code?: string }).code === SANDBOX_RELOAD_ERROR_CODE
            ? (error as Error)
            : reloadRequiredError(
                "Cryzo could not enable the browser isolation its live preview needs. Reload the builder and try again.",
              );
        throw isolationFailure;
      }
      throw new Error(
        `The Cryzo runtime could not start in this browser. ${error instanceof Error ? error.message : String(error)}`,
      );
    });

  return bootPromise;
}

export function prebootSandbox() {
  return getSandbox();
}

/** Attach HMR delivery to a preview iframe if the runtime is up; a no-op otherwise. */
export function attachSandboxPreview(frame: HTMLIFrameElement): () => void {
  if (!instance) return () => {};
  try {
    return instance.attachPreview(frame);
  } catch {
    return () => {};
  }
}

export async function resetSandboxProject(sandbox: Sandbox) {
  try {
    await sandbox.fs.rm(".");
    await sandbox.fs.mkdir(".");
  } catch (error) {
    throw new Error(
      `Unable to reset the Cryzo project workspace: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// The runtime is a per-document singleton shared across conversations. Switching
// Cryzo projects clears the project directory instead of booting a second kernel,
// which keeps the package-manager cache warm.
export async function teardownSandbox() {
  if (isolationFailure) throw isolationFailure;
  const sandbox = instance ?? (bootPromise ? await bootPromise : null);
  if (!sandbox) return;
  await resetSandboxProject(sandbox);
}

export async function writeFiles(sandbox: Sandbox, actions: ArtifactAction[]) {
  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;
    const normalized = action.filePath.replace(/^\.\//, "").replace(/^\/+/, "");
    if (!normalized) continue;
    await sandbox.fs.writeFile(normalized, action.content);
  }
}

export async function runCommand(
  sandbox: Sandbox,
  command: string,
  onOutput: (data: string) => void,
): Promise<number> {
  const process = await sandbox.spawnShell(command);
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

export async function directoryExists(sandbox: Sandbox, path: string) {
  try {
    await sandbox.fs.readdir(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectDirectoryFiles(
  sandbox: Sandbox,
  root: string,
  options: { maxFiles?: number; maxBytes?: number } = {},
) {
  const maxFiles = options.maxFiles ?? 500;
  const maxBytes = options.maxBytes ?? 15_000_000;
  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  async function walk(directory: string) {
    const entries = await sandbox.fs.readdir(directory);
    for (const entry of entries) {
      const fullPath = `${directory}/${entry.name}`.replace(/^\.\//, "");
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= maxFiles) {
        throw new Error(`Build produced too many files (more than ${maxFiles})`);
      }

      const bytes = await sandbox.fs.readFile(fullPath);
      totalBytes += bytes.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error("Build output is too large to publish from Cryzo");
      }
      files.push({
        path: fullPath.slice(root.length).replace(/^\//, ""),
        content: new TextDecoder().decode(bytes),
      });
    }
  }

  await walk(root);
  return files;
}
