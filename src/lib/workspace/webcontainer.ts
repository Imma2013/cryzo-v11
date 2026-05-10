import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

let instance: WebContainer | null = null;
let booting = false;

export async function getWebContainer(): Promise<WebContainer> {
  if (instance) return instance;
  if (booting) {
    // Wait for existing boot to finish
    while (booting) await new Promise((r) => setTimeout(r, 100));
    if (instance) return instance;
  }
  booting = true;
  try {
    instance = await WebContainer.boot();
    // Inject inspector script into all preview iframes
    try {
      const res = await fetch("/inspector-script.js");
      const script = await res.text();
      await instance.setPreviewScript(script);
    } catch {}
    return instance;
  } finally {
    booting = false;
  }
}

export async function teardownWebContainer() {
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
  onOutput: (data: string) => void,
  timeoutMs = 120000
): Promise<number> {
  const parts = command.trim().split(/\s+/);
  const cmd = parts.shift()!;
  const process = await wc.spawn(cmd, parts);

  let done = false;
  const outputPromise = process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    })
  );

  const exitPromise = process.exit.then((code) => {
    done = true;
    return code;
  });

  const timeoutPromise = new Promise<number>((_, reject) => {
    setTimeout(() => {
      if (!done) reject(new Error(`Command timed out after ${timeoutMs / 1000}s: ${command}`));
    }, timeoutMs);
  });

  try {
    const exitCode = await Promise.race([exitPromise, timeoutPromise]);
    await outputPromise.catch(() => {});
    return exitCode;
  } catch (err) {
    process.kill();
    throw err;
  }
}
