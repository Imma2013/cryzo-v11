import path from "node:path";
import ts from "typescript";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ArtifactAction, FileMap } from "@/lib/workspace/types";
import { projectReadinessIssues } from "@/lib/workspace/project-scaffold";
import { analyzeProject } from "@/lib/workspace/project-integrity";
import { localExportContractIssues } from "@/lib/server/cross-file-contracts";
import { offDomainGeneratedPaths } from "@/lib/server/project-intent";
import { removeUnusedGeneratedImports } from "@/lib/server/generated-import-hygiene";

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
      projectFiles?: Array<{ path: string; content: string }>;
      projectIntent?: string;
      command?: string;
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
      // Validate a complete client-side filesystem snapshot without allocating
      // remote compute. A missing manifest must never be reported as success.
      if (!Array.isArray(body.projectFiles) || body.projectFiles.length > MAX_PROJECT_FILES) {
        throw new Error("A project snapshot of at most 150 files is required for validation.");
      }
      const files: FileMap = {};
      for (const file of body.projectFiles) {
        if (typeof file?.path !== "string" || typeof file?.content !== "string") {
          throw new Error("Invalid project file entry.");
        }
        const filePath = safeRelativePath(file.path);
        const diagnostic = validateCandidate(filePath, file.content);
        if (diagnostic) throw new Error(`${filePath}: ${diagnostic}`);
        files[filePath] = { type: "file", content: file.content };
      }
      const repairedFiles: Array<{ path: string; content: string }> = [];
      for (const file of body.projectFiles) {
        const filePath = safeRelativePath(file.path);
        const originalContent = files[filePath]?.content || "";
        const cleaned = removeUnusedGeneratedImports(filePath, originalContent);
        if (cleaned !== originalContent) {
          files[filePath] = { type: "file", content: cleaned };
          repairedFiles.push({ path: filePath, content: cleaned });
        }
      }
      const issues = projectReadinessIssues(files, body.command);
      const diagnostics = analyzeProject(files).diagnostics;
      const missingExports = localExportContractIssues(files);
      const unrelatedPaths = offDomainGeneratedPaths(body.projectIntent || "", Object.keys(files));
      const domainErrors = unrelatedPaths.length ? [
        `Project source is inconsistent with the user's bookstore request. Replace unrelated vehicle/automotive files: ${unrelatedPaths.join(", ")}. Do not add Vehicle types to make the wrong application compile.`,
      ] : [];
      if (issues.length || diagnostics.length || missingExports.length || domainErrors.length) {
        throw new Error([...domainErrors, ...issues, ...diagnostics.map((d) => d.message), ...missingExports].slice(0, 20).join("\n"));
      }
      return Response.json({
        repairedFiles,
        output: repairedFiles.length
          ? `Cleaned unused safe-library imports in ${repairedFiles.length} generated file(s).\n`
          : "Project syntax, imports and manifest validated.\n",
        repaired: repairedFiles.length > 0,
      });
    }

    return Response.json({ error: "Unknown validation operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sandbox/validate]", error);
    return Response.json({ error: message }, { status: 422 });
  }
}
