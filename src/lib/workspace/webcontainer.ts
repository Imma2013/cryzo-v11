import { WebContainer } from "@webcontainer/api";
import type { ArtifactAction } from "./types";

let instance: WebContainer | null = null;

export async function getWebContainer(): Promise<WebContainer> {
  if (!instance) {
    instance = await WebContainer.boot({ coep: "credentialless" });
  }
  return instance;
}

export async function teardownWebContainer() {
  if (instance) {
    instance.teardown();
    instance = null;
  }
}

export async function writeFiles(
  wc: WebContainer,
  actions: ArtifactAction[]
) {
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
  const args = command.split(" ");
  const cmd = args.shift()!;
  const process = await wc.spawn(cmd, args);

  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    })
  );

  return process.exit;
}
