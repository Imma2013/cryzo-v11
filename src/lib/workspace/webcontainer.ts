import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

let instance: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (bootPromise) return bootPromise;

  bootPromise = WebContainer.boot({
    // next.config.ts serves Cryzo with COEP: require-corp. Keep the runtime
    // mode matched to the page, which is especially important on Safari/iOS.
    coep: "require-corp",
    forwardPreviewErrors: true,
  })
    .then(async (webcontainer) => {
      instance = webcontainer;

      try {
        const res = await fetch("/inspector-script.js");
        const script = await res.text();
        await webcontainer.setPreviewScript(script);
      } catch {}

      return webcontainer;
    })
    .finally(() => {
      bootPromise = null;
    });

  return bootPromise;
}

export function prebootWebContainer() {
  return getWebContainer();
}

export async function teardownWebContainer() {
  if (bootPromise) {
    try {
      await bootPromise;
    } catch {}
  }
  if (instance) {
    instance.teardown();
    instance = null;
  }
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
