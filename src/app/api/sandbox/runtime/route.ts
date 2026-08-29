import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ArtifactAction } from "@/lib/workspace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT_DIR = "/vercel/sandbox/project";
const PREVIEW_PORT = 5173;
const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_FILE_BYTES = 1_500_000;

function sandboxNameFor(conversationId: string) {
  const safe = conversationId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48);
  return `cryzo-${safe}`;
}

function safeRelativePath(input: string) {
  const normalized = path.posix.normalize(input.replace(/^\.\//, ""));
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    throw new Error(`Unsafe file path: ${input}`);
  }
  return normalized;
}

async function requireConversationOwner(req: Request, conversationId: string) {
  const authorization = req.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return false;
  }

  try {
    const conversation = await fetchQuery(
      api.conversations.get,
      { id: conversationId as Id<"conversations"> },
      { token },
    );
    return !!conversation;
  } catch {
    return false;
  }
}

async function getSandbox(conversationId: string) {
  return await Sandbox.getOrCreate({
    name: sandboxNameFor(conversationId),
    runtime: "node24",
    ports: [PREVIEW_PORT],
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    networkPolicy: "allow-all",
    onCreate: async (sandbox) => {
      await sandbox.runCommand("mkdir", ["-p", PROJECT_DIR]);
    },
  });
}

async function writeFile(sandbox: Sandbox, action: ArtifactAction) {
  if (!action.filePath) throw new Error("File action is missing filePath");
  if (Buffer.byteLength(action.content, "utf8") > MAX_FILE_BYTES) {
    throw new Error(`Generated file is too large: ${action.filePath}`);
  }

  const relative = safeRelativePath(action.filePath);
  const directory = path.posix.dirname(relative);
  if (directory !== ".") {
    await sandbox.runCommand("mkdir", ["-p", `${PROJECT_DIR}/${directory}`]);
  }

  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${relative}`,
      content: Buffer.from(action.content, "utf8"),
    },
  ]);
}

async function runInstall(sandbox: Sandbox) {
  const result = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--no-audit", "--no-fund", "--prefer-offline"],
    cwd: PROJECT_DIR,
  });

  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(stderr || stdout || `npm install exited with ${result.exitCode}`);
  }

  return [stdout, stderr].filter(Boolean).join("\n").slice(-12000);
}

async function isPreviewListening(sandbox: Sandbox) {
  const result = await sandbox.runCommand({
    cmd: "node",
    args: [
      "-e",
      `fetch('http://127.0.0.1:${PREVIEW_PORT}').then(() => process.exit(0)).catch(() => process.exit(1))`,
    ],
    cwd: PROJECT_DIR,
  });
  return result.exitCode === 0;
}

async function startPreview(sandbox: Sandbox) {
  if (!(await isPreviewListening(sandbox))) {
    await sandbox.runCommand({
      cmd: "npm",
      args: [
        "run",
        "dev",
        "--",
        "--host",
        "0.0.0.0",
        "--port",
        String(PREVIEW_PORT),
      ],
      cwd: PROJECT_DIR,
      detached: true,
    });

    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (await isPreviewListening(sandbox)) break;
    }
  }

  if (!(await isPreviewListening(sandbox))) {
    throw new Error("Vite did not start listening on the preview port");
  }

  return sandbox.domain(PREVIEW_PORT);
}

async function runShell(sandbox: Sandbox, command: string) {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    cwd: PROJECT_DIR,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(stderr || stdout || `Command exited with ${result.exitCode}`);
  }
  return [stdout, stderr].filter(Boolean).join("\n").slice(-12000);
}

async function applyAction(sandbox: Sandbox, action: ArtifactAction) {
  if (action.type === "file") {
    await writeFile(sandbox, action);
    return { progress: "writing" as const, output: `Wrote ${action.filePath}\n` };
  }

  if (action.type === "shell") {
    const isInstall = /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content.trim());
    const output = isInstall
      ? await runInstall(sandbox)
      : await runShell(sandbox, action.content.trim());
    return { progress: "installing" as const, output };
  }

  const previewUrl = await startPreview(sandbox);
  return {
    progress: "ready" as const,
    output: "Preview server ready.\n",
    previewUrl,
  };
}

async function restoreProject(sandbox: Sandbox, actions: ArtifactAction[]) {
  const fileActions = actions.filter((action) => action.type === "file");
  const shellActions = actions.filter((action) => action.type === "shell");
  const startActions = actions.filter((action) => action.type === "start");

  for (const action of fileActions) await writeFile(sandbox, action);

  let output = `Restored ${fileActions.length} project files.\n`;
  if (shellActions.some((action) => /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content))) {
    output += await runInstall(sandbox);
  }

  for (const action of shellActions) {
    if (/(^|\s)npm\s+(install|i)(\s|$)/.test(action.content)) continue;
    output += `\n${await runShell(sandbox, action.content.trim())}`;
  }

  let previewUrl: string | undefined;
  if (startActions.length > 0) {
    previewUrl = await startPreview(sandbox);
  }

  return {
    progress: previewUrl ? ("ready" as const) : ("writing" as const),
    previewUrl,
    output: output.slice(-12000),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      operation?: "init" | "action" | "restore" | "status";
      conversationId?: string;
      action?: ArtifactAction;
      actions?: ArtifactAction[];
    };

    if (!body.conversationId || body.conversationId.length > 96) {
      return Response.json({ error: "Invalid conversationId" }, { status: 400 });
    }

    if (!(await requireConversationOwner(req, body.conversationId))) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sandbox = await getSandbox(body.conversationId);
    const previewBase = sandbox.domain(PREVIEW_PORT);

    if (body.operation === "init") {
      const listening = await isPreviewListening(sandbox).catch(() => false);
      return Response.json({
        sandboxName: sandbox.name,
        previewUrl: listening ? previewBase : null,
        progress: listening ? "ready" : "writing",
      });
    }

    if (body.operation === "status") {
      const listening = await isPreviewListening(sandbox).catch(() => false);
      return Response.json({
        sandboxName: sandbox.name,
        previewUrl: listening ? previewBase : null,
        progress: listening ? "ready" : "starting",
      });
    }

    if (body.operation === "restore") {
      if (!Array.isArray(body.actions) || body.actions.length > 250) {
        return Response.json({ error: "Invalid restore actions" }, { status: 400 });
      }
      const result = await restoreProject(sandbox, body.actions);
      return Response.json({ sandboxName: sandbox.name, ...result });
    }

    if (body.operation === "action" && body.action) {
      const result = await applyAction(sandbox, body.action);
      return Response.json({ sandboxName: sandbox.name, ...result });
    }

    return Response.json({ error: "Unknown sandbox operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sandbox/runtime]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
