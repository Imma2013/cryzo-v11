import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ArtifactAction } from "@/lib/workspace/types";
import * as ts from "typescript";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT_DIR = "/vercel/sandbox/project";
const PREVIEW_PORT = 5173;
const SANDBOX_TIMEOUT_MS = 45 * 60 * 1000;
const MAX_FILE_BYTES = 1_500_000;
const MAX_REPAIR_CHARS = 120_000;
const MAX_PROJECT_FILES = 150;
const MAX_REPAIR_ATTEMPTS = 2;
const VALIDATION_DIR = ".cryzo/validation";
const REPAIR_MODEL = "minimax/minimax-m3:free";

const MODEL_PROTOCOL_MARKERS = [
  "]<]minimax[>[",
  "<minimax:tool_call",
  "</minimax:tool_call",
  "<minimax:tool_calls",
  "<mm:think",
  "</mm:think",
  "[e~[",
  "]~b]",
] as const;

const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".mts", ".cjs", ".cts"]);

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
  if (normalized === ".cryzo" || normalized.startsWith(".cryzo/")) {
    throw new Error(`Reserved Cryzo runtime path: ${input}`);
  }
  return normalized;
}

async function requireConversationOwner(req: Request, conversationId: string) {
  const authorization = req.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token) return false;

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

async function runTextCommand(
  sandbox: Sandbox,
  command: string,
  options?: { allowFailure?: boolean },
) {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    cwd: PROJECT_DIR,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  const output = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (result.exitCode !== 0 && !options?.allowFailure) {
    throw new Error(output || `Command exited with ${result.exitCode}`);
  }
  return { exitCode: result.exitCode, output };
}

function findProtocolMarker(content: string) {
  return MODEL_PROTOCOL_MARKERS.find((marker) => content.includes(marker)) ?? null;
}

function stripMarkdownFence(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
  return fenced ? fenced[1] : trimmed;
}

async function hasEsbuild(sandbox: Sandbox) {
  const result = await runTextCommand(sandbox, "test -x ./node_modules/.bin/esbuild", {
    allowFailure: true,
  });
  return result.exitCode === 0;
}

function formatTypeScriptDiagnostic(diagnostic: ts.Diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  if (!diagnostic.file || diagnostic.start == null) return message;
  const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} ${message}`;
}

function validateWithTypeScript(relativePath: string, content: string) {
  try {
    const result = ts.transpileModule(content, {
      fileName: relativePath,
      compilerOptions: {
        allowJs: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    const diagnostics = (result.diagnostics || []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
    );
    if (diagnostics.length === 0) return null;
    return diagnostics.slice(0, 8).map(formatTypeScriptDiagnostic).join("\n");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function validateSourceSyntax(
  sandbox: Sandbox,
  relativePath: string,
  content: string,
) {
  const extension = path.posix.extname(relativePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) return null;

  const parserError = validateWithTypeScript(relativePath, content);
  if (parserError) return `Invalid syntax in ${relativePath}: ${parserError}`;
  if (!(await hasEsbuild(sandbox))) return null;

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tempRelative = `${VALIDATION_DIR}/candidate-${token}${extension}`;
  const outRelative = `${VALIDATION_DIR}/candidate-${token}.js`;

  await sandbox.runCommand("mkdir", ["-p", `${PROJECT_DIR}/${VALIDATION_DIR}`]);
  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${tempRelative}`,
      content: Buffer.from(content, "utf8"),
    },
  ]);

  try {
    const result = await sandbox.runCommand({
      cmd: "./node_modules/.bin/esbuild",
      args: [tempRelative, `--outfile=${outRelative}`, "--log-level=error"],
      cwd: PROJECT_DIR,
    });
    const stdout = await result.stdout();
    const stderr = await result.stderr();
    if (result.exitCode !== 0) {
      return (stderr || stdout || "Generated source contains invalid syntax").slice(-8000);
    }
    return null;
  } finally {
    await runTextCommand(sandbox, `rm -f ${tempRelative} ${outRelative}`, {
      allowFailure: true,
    });
  }
}

async function validateCandidate(
  sandbox: Sandbox,
  filePath: string,
  content: string,
) {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return `Generated file is too large: ${filePath}`;
  }

  const marker = findProtocolMarker(content);
  if (marker) {
    return `Model transport marker ${JSON.stringify(marker)} leaked into ${filePath}`;
  }

  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === ".json") {
    try {
      JSON.parse(content);
    } catch (error) {
      return `Invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  return await validateSourceSyntax(sandbox, filePath, content);
}

async function repairFile(
  sandbox: Sandbox,
  filePath: string,
  content: string,
  validationError: string,
) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(`Generated file validation failed for ${filePath}: ${validationError}`);
  }
  if (content.length > MAX_REPAIR_CHARS) {
    throw new Error(`Generated file validation failed for ${filePath}, and the file is too large to auto-repair.`);
  }

  let candidate = content;
  let lastError = validationError;

  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://www.cryzo.me",
        "X-Title": "Cryzo Generated File Repair",
      },
      body: JSON.stringify({
        model: REPAIR_MODEL,
        temperature: 0.1,
        max_tokens: 12000,
        messages: [
          {
            role: "system",
            content:
              "You repair one generated source file. Return ONLY the complete corrected raw file contents. Do not use Markdown fences, XML, tool calls, commentary, thinking tags, or MiniMax transport tokens. Preserve the intended design and behavior while fixing the reported validation error.",
          },
          {
            role: "user",
            content: `File: ${filePath}\n\nValidation error:\n${lastError}\n\nCurrent file:\n${candidate}`,
          },
        ],
      }),
    });

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(payload.error?.message || `Auto-repair request failed with ${response.status}`);
    }

    const repaired = stripMarkdownFence(payload.choices?.[0]?.message?.content || "");
    if (!repaired) {
      lastError = "Repair model returned an empty file";
      continue;
    }

    const repairedError = await validateCandidate(sandbox, filePath, repaired);
    if (!repairedError) {
      return {
        content: repaired,
        output: `Auto-repaired ${filePath} after validation failed: ${validationError}\n`,
      };
    }

    candidate = repaired;
    lastError = repairedError;
  }

  throw new Error(`Generated file validation failed for ${filePath}: ${lastError}`);
}

async function validateAndRepairAction(sandbox: Sandbox, action: ArtifactAction) {
  if (action.type !== "file" || !action.filePath) {
    return { action, output: "", repaired: false };
  }

  const filePath = safeRelativePath(action.filePath);
  const validationError = await validateCandidate(sandbox, filePath, action.content);
  if (!validationError) {
    return { action: { ...action, filePath }, output: "", repaired: false };
  }

  const repair = await repairFile(sandbox, filePath, action.content, validationError);
  return {
    action: { ...action, filePath, content: repair.content },
    output: repair.output,
    repaired: true,
  };
}

async function validateStoredProject(sandbox: Sandbox) {
  const listing = await runTextCommand(
    sandbox,
    "find . -path './node_modules' -prune -o -path './.cryzo' -prune -o -type f \\( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.mjs' -o -name '*.mts' -o -name '*.cjs' -o -name '*.cts' -o -name '*.json' \\) -print 2>/dev/null | sed 's#^\\./##' | head -n 151",
    { allowFailure: true },
  );
  const paths = listing.output
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (paths.length > MAX_PROJECT_FILES) {
    throw new Error(`Project contains too many source files to validate (${paths.length})`);
  }

  const repairedFiles: Array<{ path: string; content: string }> = [];
  let output = "";

  for (const relativePath of paths) {
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (!SOURCE_EXTENSIONS.has(extension) && extension !== ".json") continue;

    const buffer = await sandbox.readFileToBuffer({
      path: `${PROJECT_DIR}/${relativePath}`,
    });
    if (!buffer) continue;
    const content = buffer.toString("utf8");
    const validationError = await validateCandidate(sandbox, relativePath, content);
    if (!validationError) continue;

    const repair = await repairFile(sandbox, relativePath, content, validationError);
    await sandbox.writeFiles([
      {
        path: `${PROJECT_DIR}/${relativePath}`,
        content: Buffer.from(repair.content, "utf8"),
      },
    ]);
    repairedFiles.push({ path: relativePath, content: repair.content });
    output += repair.output;
  }

  return { repairedFiles, output };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      operation?: "file" | "actions" | "project";
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

    if (body.operation === "file" && body.action) {
      const result = await validateAndRepairAction(sandbox, body.action);
      return Response.json(result);
    }

    if (body.operation === "actions") {
      if (!Array.isArray(body.actions) || body.actions.length > 250) {
        return Response.json({ error: "Invalid actions" }, { status: 400 });
      }
      const actions: ArtifactAction[] = [];
      let output = "";
      let repaired = false;
      for (const action of body.actions) {
        const result = await validateAndRepairAction(sandbox, action);
        actions.push(result.action);
        output += result.output;
        repaired ||= result.repaired;
      }
      return Response.json({ actions, output, repaired });
    }

    if (body.operation === "project") {
      return Response.json(await validateStoredProject(sandbox));
    }

    return Response.json({ error: "Unknown validation operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sandbox/validate]", error);
    return Response.json({ error: message }, { status: 422 });
  }
}
