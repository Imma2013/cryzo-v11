import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

export const WEBCONTAINER_RELOAD_ERROR_CODE = "WEB_CONTAINER_RELOAD_REQUIRED";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;
let bootFailure: Error | null = null;
let bootAttempted = false;

function reloadRequiredError(message: string) {
  const error = new Error(message) as Error & { code?: string };
  error.code = WEBCONTAINER_RELOAD_ERROR_CODE;
  return error;
}

export function isWebContainerReloadRequiredError(error: unknown) {
  if (!error) return false;
  const code = typeof error === "object" && "code" in error ? (error as { code?: string }).code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === WEBCONTAINER_RELOAD_ERROR_CODE ||
    /cross.?origin.?isolated|SharedArrayBuffer|Unable to create more instances|WebContainer.*reload/i.test(message)
  );
}

function assertCrossOriginIsolation() {
  if (typeof window !== "undefined" && !window.crossOriginIsolated) {
    throw reloadRequiredError(
      "Cryzo needs to reload the builder before starting WebContainer preview. Cross-origin isolation is not active in this document.",
    );
  }
}

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (bootFailure) throw bootFailure;
  if (bootPromise) return bootPromise;

  assertCrossOriginIsolation();

  if (bootAttempted) {
    throw reloadRequiredError(
      "WebContainer already attempted to boot in this browser document. Reload the builder to start a fresh runtime.",
    );
  }

  bootAttempted = true;
  bootPromise = WebContainer.boot({
    coep: "require-corp",
    workdirName: "cryzo-project",
    forwardPreviewErrors: true,
  })
    .then(async (webcontainer) => {
      instance = webcontainer;

      try {
        const res = await fetch("/inspector-script.js");
        if (res.ok) {
          const script = await res.text();
          await webcontainer.setPreviewScript(script);
        }
      } catch {
        // Inspector injection is optional; preview execution should still work.
      }

      return webcontainer;
    })
    .catch((error) => {
      bootFailure = isWebContainerReloadRequiredError(error)
        ? (error as Error)
        : reloadRequiredError(
            `WebContainer could not start in this browser document. Reload the builder and try again. ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
      throw bootFailure;
    });

  return bootPromise;
}

export function prebootWebContainer() {
  return getWebContainer();
}

export async function resetWebContainerProject(wc: WebContainer) {
  const entries = await wc.fs.readdir(".", { withFileTypes: true });
  for (const entry of entries) {
    try {
      await (wc.fs as any).rm(entry.name, { recursive: true, force: true });
    } catch (error) {
      throw new Error(
        `Unable to reset the WebContainer project workspace at ${entry.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

export async function teardownWebContainer() {
  if (bootPromise) {
    try {
      await bootPromise;
    } catch {
      // A failed boot has nothing to tear down.
    }
  }

  if (instance) {
    instance.teardown();
    instance = null;
  }

  bootPromise = null;
  bootFailure = reloadRequiredError(
    "WebContainer was torn down in this browser document. Reload the builder before starting it again.",
  );
  bootAttempted = true;
}

export async function writeFiles(wc: WebContainer, actions: ArtifactAction[]) {
  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;

    const normalized = action.filePath.replace(/^\.\//, "").replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length > 1) {
      await wc.fs.mkdir(parts.slice(0, -1).join("/"), { recursive: true });
    }
    await wc.fs.writeFile(normalized, action.content);
  }
}

export async function runCommand(
  wc: WebContainer,
  command: string,
  onOutput: (data: string) => void,
): Promise<number> {
  const process = await wc.spawn("jsh", ["-c", command]);
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

export async function directoryExists(wc: WebContainer, path: string) {
  try {
    await wc.fs.readdir(path);
    return true;
  } catch {
    return false;
  }
}

export async function collectDirectoryFiles(
  wc: WebContainer,
  root: string,
  options: { maxFiles?: number; maxBytes?: number } = {},
) {
  const maxFiles = options.maxFiles ?? 500;
  const maxBytes = options.maxBytes ?? 15_000_000;
  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;

  async function walk(directory: string) {
    const entries = await wc.fs.readdir(directory, { withFileTypes: true });
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

      const bytes = await wc.fs.readFile(fullPath);
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
