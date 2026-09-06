import path from "node:path";
import ts from "typescript";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ArtifactAction } from "@/lib/workspace/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 1_500_000;
const MAX_PROJECT_FILES = 150;

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

const SOURCE_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".mts",
  ".cjs",
  ".cts",
]);

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

function findProtocolMarker(content: string) {
  return MODEL_PROTOCOL_MARKERS.find((marker) => content.includes(marker)) ?? null;
}

function formatDiagnostic(diagnostic: ts.Diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

function validateJsonFile(filePath: string, content: string) {
  const basename = path.posix.basename(filePath).toLowerCase();
  if (basename === "tsconfig.json" || basename === "jsconfig.json") {
    const parsed = ts.parseConfigFileTextToJson(filePath, content);
    return parsed.error ? formatDiagnostic(parsed.error) : null;
  }

  try {
    const parsed = JSON.parse(content) as any;
    if (basename === "package.json") {
      const dependencies = {
        ...(parsed?.dependencies || {}),
        ...(parsed?.devDependencies || {}),
        ...(parsed?.peerDependencies || {}),
      } as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(dependencies, "@cryzo/cloud")) {
        return "Do not install @cryzo/cloud. Cryzo Cloud is a managed platform API; generated apps must use a local fetch helper against /api/cloud/v1.";
      }
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function compilerOptionsFor(filePath: string): ts.CompilerOptions {
  const extension = path.posix.extname(filePath).toLowerCase();
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: extension === ".jsx" || extension === ".tsx"
      ? ts.JsxEmit.ReactJSX
      : ts.JsxEmit.Preserve,
    allowJs: true,
    esModuleInterop: true,
    resolveJsonModule: true,
  };
}

function validateSourceSyntax(filePath: string, content: string) {
  const extension = path.posix.extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(extension)) return null;

  const result = ts.transpileModule(content, {
    fileName: filePath,
    compilerOptions: compilerOptionsFor(filePath),
    reportDiagnostics: true,
  });
  const diagnostics = (result.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (diagnostics.length === 0) return null;
  return diagnostics.slice(0, 8).map(formatDiagnostic).join("\n");
}

function validateCandidate(filePath: string, content: string) {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    return `Generated file is too large: ${filePath}`;
  }

  const marker = findProtocolMarker(content);
  if (marker) {
    return `Model transport marker ${JSON.stringify(marker)} leaked into ${filePath}`;
  }

  const extension = path.posix.extname(filePath).toLowerCase();
  if (extension === ".json") {
    const jsonError = validateJsonFile(filePath, content);
    if (jsonError) return `Invalid JSON in ${filePath}: ${jsonError}`;
  }

  return validateSourceSyntax(filePath, content);
}

function validateAction(action: ArtifactAction) {
  if (action.type !== "file" || !action.filePath) {
    return { action, output: "", repaired: false };
  }

  const filePath = safeRelativePath(action.filePath);
  const validationError = validateCandidate(filePath, action.content);
  if (validationError) {
    throw new Error(
      `Generated file validation failed for ${filePath}: ${validationError}`,
    );
  }

  return {
    action: { ...action, filePath },
    output: "",
    repaired: false,
  };
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

    if (body.operation === "file" && body.action) {
      return Response.json(validateAction(body.action));
    }

    if (body.operation === "actions") {
      if (!Array.isArray(body.actions) || body.actions.length > 250) {
        return Response.json({ error: "Invalid actions" }, { status: 400 });
      }
      const actions = body.actions.map((action) => validateAction(action).action);
      return Response.json({ actions, output: "", repaired: false });
    }

    if (body.operation === "project") {
      // Every generated/saved file is validated before it enters the runtime.
      // Project validation must never require allocating remote compute; this
      // keeps source/code available even when preview infrastructure is down.
      return Response.json({
        repairedFiles: [],
        output: "",
        repaired: false,
        maxFiles: MAX_PROJECT_FILES,
      });
    }

    return Response.json({ error: "Unknown validation operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sandbox/validate]", error);
    return Response.json({ error: message }, { status: 422 });
  }
}
