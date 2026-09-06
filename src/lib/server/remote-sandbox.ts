import { Sandbox as VercelSandbox } from "@vercel/sandbox";
import { ModalClient, NotFoundError, type Sandbox as ModalSandbox } from "modal";

export type RemoteSandboxProvider = "modal" | "vercel";

export type RemoteCommandResult = {
  exitCode: number;
  stdout(): Promise<string>;
  stderr(): Promise<string>;
};

export type RemoteCommand = {
  cmd: string;
  args?: string[];
  cwd?: string;
};

export type RemoteSandbox = {
  readonly name: string;
  readonly provider: RemoteSandboxProvider;
  readonly previewUrl: string;
  runCommand(command: string, args?: string[]): Promise<RemoteCommandResult>;
  runCommand(command: RemoteCommand): Promise<RemoteCommandResult>;
  writeFiles(files: Array<{ path: string; content: Buffer }>): Promise<void>;
  readFileToBuffer(input: { path: string }): Promise<Buffer | null>;
};

const PREVIEW_PORT = 5173;
const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
const MODAL_IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MODAL_APP_NAME = process.env.CRYZO_MODAL_APP_NAME || "cryzo-sandboxes";
const MODAL_IMAGE = process.env.CRYZO_MODAL_IMAGE || "node:22-bookworm-slim";
const MODAL_REGION = process.env.CRYZO_MODAL_REGION?.trim();

function modalConfigured() {
  return Boolean(process.env.MODAL_TOKEN_ID && process.env.MODAL_TOKEN_SECRET);
}

export function selectedRemoteSandboxProvider(): RemoteSandboxProvider {
  const requested = process.env.CRYZO_SANDBOX_PROVIDER?.toLowerCase();
  if (requested === "modal") return modalConfigured() ? "modal" : "vercel";
  if (requested === "vercel") return "vercel";
  return modalConfigured() ? "modal" : "vercel";
}

function safeName(conversationId: string) {
  return conversationId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 44);
}

function sandboxName(conversationId: string, provider: RemoteSandboxProvider) {
  // The v2 prefix intentionally avoids resuming the old persistent Vercel
  // sandboxes whose snapshots exhausted the project storage quota.
  return `cryzo-v2-${provider}-${safeName(conversationId)}`;
}

function bufferedResult(exitCode: number, stdout: string, stderr: string): RemoteCommandResult {
  return {
    exitCode,
    stdout: async () => stdout,
    stderr: async () => stderr,
  };
}

async function createModalSandbox(conversationId: string): Promise<RemoteSandbox> {
  const modal = new ModalClient({
    tokenId: process.env.MODAL_TOKEN_ID,
    tokenSecret: process.env.MODAL_TOKEN_SECRET,
  });
  const name = sandboxName(conversationId, "modal");
  const app = await modal.apps.fromName(MODAL_APP_NAME, { createIfMissing: true });

  let sandbox: ModalSandbox;
  try {
    sandbox = await modal.sandboxes.fromName(MODAL_APP_NAME, name);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;
    const image = modal.images.fromRegistry(MODAL_IMAGE);
    sandbox = await modal.sandboxes.create(app, image, {
      name,
      command: ["sleep", "infinity"],
      encryptedPorts: [PREVIEW_PORT],
      timeoutMs: SANDBOX_TIMEOUT_MS,
      idleTimeoutMs: MODAL_IDLE_TIMEOUT_MS,
      cpu: 2,
      memoryMiB: 2048,
      regions: MODAL_REGION ? [MODAL_REGION] : undefined,
      tags: {
        product: "cryzo",
        conversation: safeName(conversationId),
      },
    });
  }

  const tunnels = await sandbox.tunnels();
  const tunnel = tunnels[PREVIEW_PORT];
  if (!tunnel) throw new Error(`Modal did not expose preview port ${PREVIEW_PORT}`);
  const previewUrl = tunnel.url;

  return {
    name,
    provider: "modal",
    previewUrl,
    async runCommand(command: string | RemoteCommand, args: string[] = []) {
      const normalized = typeof command === "string"
        ? { cmd: command, args }
        : { cmd: command.cmd, args: command.args || [], cwd: command.cwd };
      const process = await sandbox.exec([normalized.cmd, ...normalized.args], {
        workdir: normalized.cwd,
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        process.stdout.readText(),
        process.stderr.readText(),
        process.wait(),
      ]);
      return bufferedResult(exitCode, stdout, stderr);
    },
    async writeFiles(files) {
      await Promise.all(
        files.map((file) => sandbox.filesystem.writeBytes(file.content, file.path)),
      );
    },
    async readFileToBuffer({ path }) {
      try {
        const bytes = await sandbox.filesystem.readBytes(path);
        return Buffer.from(bytes);
      } catch {
        return null;
      }
    },
  };
}

async function createVercelSandbox(conversationId: string): Promise<RemoteSandbox> {
  const name = sandboxName(conversationId, "vercel");
  const sandbox = await VercelSandbox.getOrCreate({
    name,
    runtime: "node24",
    ports: [PREVIEW_PORT],
    timeout: SANDBOX_TIMEOUT_MS,
    // Generated source already lives in Convex. Preview compute should be
    // disposable; persistent snapshots are unnecessary and can exhaust quota.
    persistent: false,
    networkPolicy: "allow-all",
    onCreate: async (created) => {
      await created.runCommand("mkdir", ["-p", "/workspace/project"]);
    },
    onResume: async (resumed) => {
      await resumed.runCommand("mkdir", ["-p", "/workspace/project"]);
    },
  });

  return {
    name,
    provider: "vercel",
    previewUrl: sandbox.domain(PREVIEW_PORT),
    async runCommand(command: string | RemoteCommand, args: string[] = []) {
      if (typeof command === "string") return await sandbox.runCommand(command, args);
      return await sandbox.runCommand({
        cmd: command.cmd,
        args: command.args || [],
        cwd: command.cwd,
      });
    },
    async writeFiles(files) {
      await sandbox.writeFiles(files);
    },
    async readFileToBuffer(input) {
      return await sandbox.readFileToBuffer(input);
    },
  };
}

export async function getRemoteSandbox(conversationId: string): Promise<RemoteSandbox> {
  const provider = selectedRemoteSandboxProvider();
  if (provider === "modal") {
    try {
      return await createModalSandbox(conversationId);
    } catch (error) {
      // Automatic fallback keeps generation usable if Modal is temporarily
      // unavailable. Set CRYZO_SANDBOX_STRICT_MODAL=1 to disable fallback.
      if (process.env.CRYZO_SANDBOX_STRICT_MODAL === "1") throw error;
      console.error("[sandbox/modal] falling back to ephemeral Vercel Sandbox", error);
    }
  }
  return await createVercelSandbox(conversationId);
}
