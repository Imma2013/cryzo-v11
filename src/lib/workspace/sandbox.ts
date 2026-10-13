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
  type: "PREVIEW_UNCAUGHT_EXCEPTION" | "PREVIEW_UNHANDLED_REJECTION" | "PREVIEW_LAYOUT_DIAGNOSTIC";
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
        if (type !== "PREVIEW_UNCAUGHT_EXCEPTION" && type !== "PREVIEW_UNHANDLED_REJECTION" && type !== "PREVIEW_LAYOUT_DIAGNOSTIC") return;
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

const SANDBOX_INFRASTRUCTURE_CODES = new Set([
  SANDBOX_RELOAD_ERROR_CODE,
  "ERR_NOT_ISOLATED",
  "ERR_BOOT_FAILED",
  "ERR_BOOT_TIMEOUT",
  "ERR_WORKER",
  "ERR_TORN_DOWN",
  "ERR_ABORTED",
  "ERR_PREVIEW_SERVICE_WORKER",
]);

export function isSandboxInfrastructureError(error: unknown) {
  if (!error) return false;
  const code = typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
  if (code && SANDBOX_INFRASTRUCTURE_CODES.has(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /Cryzo runtime could not start|Vivari\.boot|kernel worker|preview Service Worker|cross.?origin.?isolat|SharedArrayBuffer/i.test(message);
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
  // Mode B can isolate arbitrary preview code from Cryzo's authenticated UI.
  // Enable only after a dedicated static bridge origin is fully provisioned.
  const configuredPreviewOrigin = process.env.NEXT_PUBLIC_VIVARI_PREVIEW_ORIGIN?.trim();
  let previewOrigin: string | undefined;
  if (configuredPreviewOrigin) {
    const parsed = new URL(configuredPreviewOrigin);
    if (parsed.protocol !== "https:" || parsed.origin !== configuredPreviewOrigin ||
        (typeof window !== "undefined" && parsed.origin === window.location.origin)) {
      throw new Error("NEXT_PUBLIC_VIVARI_PREVIEW_ORIGIN must be a separate HTTPS origin without a path.");
    }
    previewOrigin = parsed.origin;
  }
  // Bring the kernel online before installing the preview Service Worker. Vivari
  // Studio uses this ordering because a Service Worker activation during worker
  // module loading can interrupt the kernel before it reports ready.
  const vivari = await VivariRuntime.boot({
    serviceWorkerUrl: false,
    ...(previewOrigin ? { previewOrigin, previewPopout: "isolated" as const } : {}),
    workerName: "Cryzo Runtime",
    timeout: 45_000,
  });
  await vivari.fs.mkdir(SANDBOX_PROJECT_DIR, { recursive: true });

  const previewReady = await vivari.internal.registerServiceWorker(VIVARI_SERVICE_WORKER);
  if (!previewReady) {
    vivari.teardown();
    const error = new Error("The Cryzo preview Service Worker could not be registered.") as Error & { code?: string };
    error.code = "ERR_PREVIEW_SERVICE_WORKER";
    throw error;
  }
  vivari.internal.setDevtoolsEnabled(true);
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
      const wrapped = new Error(
        `The Cryzo runtime could not start in this browser. ${error instanceof Error ? error.message : String(error)}`,
      ) as Error & { code?: string };
      if (error && typeof error === "object" && "code" in error) {
        wrapped.code = String((error as { code?: unknown }).code || "");
      }
      throw wrapped;
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
/** Force a fresh browser runtime after iOS Safari suspends its workers.
 * Do not unregister the origin Service Worker: it also serves other tabs. */
export async function rebootSandboxRuntime() {
  const previous = instance;
  instance = null;
  bootPromise = null;
  isolationFailure = null;
  if (previous) {
    const kernel = (previous as any).vivari;
    try { await (kernel?.dispose?.() ?? kernel?.destroy?.()); } catch { /* Worker may already be gone. */ }
  }
}

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
