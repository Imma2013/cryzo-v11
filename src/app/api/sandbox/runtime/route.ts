import path from "node:path";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import type { ArtifactAction } from "@/lib/workspace/types";
import {
  getRemoteSandbox,
  type RemoteSandbox,
} from "@/lib/server/remote-sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROJECT_DIR = "/workspace/project";
const PREVIEW_PORT = 5173;
const MAX_FILE_BYTES = 1_500_000;
const MAX_BUILD_FILES = 500;
const MAX_BUILD_BYTES = 15_000_000;
const PREVIEW_PID_FILE = ".cryzo-preview.pid";
const PREVIEW_LOG_FILE = ".cryzo-preview.log";
const RUNTIME_DIR = ".cryzo";
const RUNTIME_CONFIG_FILE = `${RUNTIME_DIR}/vite.runtime.config.ts`;
const DEPENDENCY_HASH_FILE = `${RUNTIME_DIR}/package.sha256`;
const SAFE_VITE_5 = "5.4.21";
const VITE_CONFIG_CANDIDATES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs",
] as const;

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
  if (normalized === RUNTIME_DIR || normalized.startsWith(`${RUNTIME_DIR}/`)) {
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
  const sandbox = await getRemoteSandbox(conversationId);
  await runTextCommand(sandbox, `mkdir -p ${PROJECT_DIR}`);
  return sandbox;
}

function previewHostFor(sandbox: RemoteSandbox) {
  return new URL(sandbox.previewUrl).hostname;
}

async function runTextCommand(
  sandbox: RemoteSandbox,
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

async function writeFile(sandbox: RemoteSandbox, action: ArtifactAction) {
  if (!action.filePath) throw new Error("File action is missing filePath");
  if (Buffer.byteLength(action.content, "utf8") > MAX_FILE_BYTES) {
    throw new Error(`Generated file is too large: ${action.filePath}`);
  }

  const relative = safeRelativePath(action.filePath);
  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${relative}`,
      content: Buffer.from(action.content, "utf8"),
    },
  ]);

  if (relative === "package.json") {
    await runTextCommand(sandbox, `rm -f ${DEPENDENCY_HASH_FILE}`, {
      allowFailure: true,
    });
  }
}

async function packageHash(sandbox: RemoteSandbox) {
  const result = await runTextCommand(
    sandbox,
    `node -e "const fs=require('fs'),c=require('crypto');if(!fs.existsSync('package.json'))process.exit(2);process.stdout.write(c.createHash('sha256').update(fs.readFileSync('package.json')).digest('hex'))"`,
    { allowFailure: true },
  );
  return result.exitCode === 0 ? result.output.trim() : null;
}

async function storedDependencyHash(sandbox: RemoteSandbox) {
  const result = await runTextCommand(
    sandbox,
    `test -f ${DEPENDENCY_HASH_FILE} && cat ${DEPENDENCY_HASH_FILE} || true`,
    { allowFailure: true },
  );
  return result.output.trim() || null;
}

async function recordDependencyHash(sandbox: RemoteSandbox) {
  const hash = await packageHash(sandbox);
  if (!hash) return;
  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${DEPENDENCY_HASH_FILE}`,
      content: Buffer.from(`${hash}\n`, "utf8"),
    },
  ]);
}

async function verifyRequiredModules(sandbox: RemoteSandbox) {
  const result = await runTextCommand(
    sandbox,
    `node -e "const p=require('./package.json');const d={...(p.dependencies||{}),...(p.devDependencies||{})};const mods=['vite'];if(d.react){mods.push('react','react/jsx-runtime','react/jsx-dev-runtime')}if(d['react-dom'])mods.push('react-dom');for(const m of mods)require.resolve(m);"`,
    { allowFailure: true },
  );
  return result.exitCode === 0;
}

async function runInstall(sandbox: RemoteSandbox) {
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
  await recordDependencyHash(sandbox);
  return [stdout, stderr].filter(Boolean).join("\n").slice(-12000);
}

async function ensureDependencies(sandbox: RemoteSandbox) {
  const currentHash = await packageHash(sandbox);
  if (!currentHash) return "";

  const nodeModules = await runTextCommand(sandbox, "test -d node_modules", {
    allowFailure: true,
  });
  const installedHash = await storedDependencyHash(sandbox);
  const healthy = nodeModules.exitCode === 0 && (await verifyRequiredModules(sandbox));

  if (nodeModules.exitCode !== 0 || installedHash !== currentHash || !healthy) {
    const reason = nodeModules.exitCode !== 0
      ? "node_modules missing"
      : installedHash !== currentHash
        ? "package.json changed"
        : "required module missing";
    return `Installing dependencies (${reason})...\n${await runInstall(sandbox)}\n`;
  }
  return "";
}

function parseVersion(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

async function getViteVersion(sandbox: RemoteSandbox) {
  const result = await runTextCommand(
    sandbox,
    "node -p \"require('./node_modules/vite/package.json').version\"",
    { allowFailure: true },
  );
  return result.exitCode === 0 ? result.output.trim() : null;
}

async function ensureCompatibleVite(sandbox: RemoteSandbox) {
  const version = await getViteVersion(sandbox);
  if (!version) throw new Error("Vite is not installed in the project");
  const parsed = parseVersion(version);
  if (!parsed) return `Vite ${version}\n`;
  const [major, minor, patch] = parsed;
  const unsafe = major === 5 && (minor < 4 || (minor === 4 && patch < 21));
  if (!unsafe) return `Vite ${version}\n`;

  const result = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "--save-dev", `vite@${SAFE_VITE_5}`, "--no-audit", "--no-fund"],
    cwd: PROJECT_DIR,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) {
    throw new Error(stderr || stdout || `Failed to upgrade Vite from ${version}`);
  }
  await recordDependencyHash(sandbox);
  return `Upgraded Vite ${version} → ${SAFE_VITE_5}\n`;
}

async function findUserViteConfig(sandbox: RemoteSandbox) {
  for (const candidate of VITE_CONFIG_CANDIDATES) {
    const result = await runTextCommand(sandbox, `test -f ${candidate}`, {
      allowFailure: true,
    });
    if (result.exitCode === 0) return candidate;
  }
  return null;
}

async function writeRuntimeViteConfig(sandbox: RemoteSandbox) {
  const publicHost = previewHostFor(sandbox);
  const userConfigPath = await findUserViteConfig(sandbox);
  const importLine = userConfigPath
    ? `import userConfigExport from ${JSON.stringify(`../${userConfigPath}`)};`
    : "const userConfigExport = {};";
  const source = `import { defineConfig, mergeConfig } from "vite";\n${importLine}\n\nconst cryzoInspectorPlugin = {\n  name: "cryzo-preview-inspector",\n  transformIndexHtml() {\n    return [{ tag: "script", attrs: { src: "https://cryzo.me/inspector-script.js" }, injectTo: "body" }];\n  },\n};\n\nconst cryzoRuntimeConfig = {\n  plugins: [cryzoInspectorPlugin],\n  server: { host: "0.0.0.0", port: ${PREVIEW_PORT}, strictPort: true, allowedHosts: [${JSON.stringify(publicHost)}] },\n};\n\nexport default defineConfig(async (env) => {\n  const candidate = typeof userConfigExport === "function" ? await userConfigExport(env) : await userConfigExport;\n  return mergeConfig(candidate || {}, cryzoRuntimeConfig);\n});\n`;
  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${RUNTIME_CONFIG_FILE}`,
      content: Buffer.from(source, "utf8"),
    },
  ]);
  return { publicHost, userConfigPath };
}

async function moduleScriptSources(html: string) {
  const sources: string[] = [];
  const pattern = /<script\b[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null && sources.length < 4) sources.push(match[1]);
  return sources;
}

async function checkPublicPreview(sandbox: RemoteSandbox) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(sandbox.previewUrl, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "CryzoPreviewHealth/2.0" },
    });
    const body = (await response.text()).slice(0, 12000);
    if (!response.ok || body.includes("Blocked request. This host")) {
      return { ready: false, status: response.status, reason: `HTTP ${response.status}` };
    }
    for (const source of await moduleScriptSources(body)) {
      const moduleUrl = new URL(source, sandbox.previewUrl).toString();
      const moduleResponse = await fetch(moduleUrl, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "User-Agent": "CryzoPreviewHealth/2.0" },
      });
      const moduleBody = (await moduleResponse.text()).slice(0, 5000);
      if (!moduleResponse.ok || /Failed to resolve import|Internal Server Error|Pre-transform error/i.test(moduleBody)) {
        return { ready: false, status: moduleResponse.status, reason: `Module ${source} failed import analysis` };
      }
    }
    return { ready: true, status: response.status, reason: null as string | null };
  } catch (error) {
    return {
      ready: false,
      status: 0,
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function tailPreviewLog(sandbox: RemoteSandbox) {
  const result = await runTextCommand(
    sandbox,
    `test -f ${PREVIEW_LOG_FILE} && tail -n 100 ${PREVIEW_LOG_FILE} || true`,
    { allowFailure: true },
  );
  return result.output.slice(-16000);
}

async function previewDiagnostics(sandbox: RemoteSandbox) {
  const packageInfo = await runTextCommand(
    sandbox,
    "node -e \"try{const p=require('./package.json');console.log(JSON.stringify({name:p.name,scripts:p.scripts,dependencies:p.dependencies,devDependencies:p.devDependencies},null,2))}catch(e){console.error(String(e))}\"",
    { allowFailure: true },
  );
  const processes = await runTextCommand(
    sandbox,
    `ps -ef | grep -E '[v]ite|[n]pm run dev' || true`,
    { allowFailure: true },
  );
  const log = await tailPreviewLog(sandbox);
  return [
    `Sandbox provider: ${sandbox.provider}`,
    `Sandbox: ${sandbox.name}`,
    `Preview URL: ${sandbox.previewUrl}`,
    packageInfo.output ? `package.json:\n${packageInfo.output}` : "",
    processes.output ? `Processes:\n${processes.output}` : "",
    log ? `Preview log:\n${log}` : "Preview log: empty",
  ].filter(Boolean).join("\n\n").slice(-20000);
}

async function stopPreview(sandbox: RemoteSandbox) {
  await runTextCommand(
    sandbox,
    `if [ -f ${PREVIEW_PID_FILE} ]; then pid=$(cat ${PREVIEW_PID_FILE} 2>/dev/null || true); [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; fi; rm -f ${PREVIEW_PID_FILE}; pkill -f '[v]ite.*${PREVIEW_PORT}' 2>/dev/null || true`,
    { allowFailure: true },
  );
}

async function launchPreview(sandbox: RemoteSandbox) {
  const config = await writeRuntimeViteConfig(sandbox);
  await runTextCommand(
    sandbox,
    `rm -f ${PREVIEW_LOG_FILE} ${PREVIEW_PID_FILE}; nohup ./node_modules/.bin/vite --config ${RUNTIME_CONFIG_FILE} > ${PREVIEW_LOG_FILE} 2>&1 & echo $! > ${PREVIEW_PID_FILE}`,
  );
  return config;
}

async function startPreview(sandbox: RemoteSandbox, forceRestart = false) {
  let output = `Sandbox provider: ${sandbox.provider}\n`;
  output += await ensureDependencies(sandbox);
  output += await ensureCompatibleVite(sandbox);

  if (!forceRestart) {
    const existing = await checkPublicPreview(sandbox);
    if (existing.ready) {
      return { previewUrl: sandbox.previewUrl, output: `${output}Preview already healthy.\n` };
    }
  }

  await stopPreview(sandbox);
  const config = await launchPreview(sandbox);
  output += `Cryzo runtime config: ${config.userConfigPath || "no user vite.config found"} + ${config.publicHost}\n`;

  let check = await checkPublicPreview(sandbox);
  for (let attempt = 0; attempt < 90 && !check.ready; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    check = await checkPublicPreview(sandbox);
  }
  if (!check.ready) {
    throw new Error(`${check.reason || "Preview did not become healthy"}.\n\n${await previewDiagnostics(sandbox)}`);
  }
  return { previewUrl: sandbox.previewUrl, output: `${output}Preview server ready at ${sandbox.previewUrl}.\n` };
}

async function runShell(sandbox: RemoteSandbox, command: string) {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    cwd: PROJECT_DIR,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  if (result.exitCode !== 0) throw new Error(stderr || stdout || `Command exited with ${result.exitCode}`);
  return [stdout, stderr].filter(Boolean).join("\n").slice(-12000);
}

async function buildStaticProject(sandbox: RemoteSandbox) {
  let output = await ensureDependencies(sandbox);
  const build = await sandbox.runCommand({ cmd: "npm", args: ["run", "build"], cwd: PROJECT_DIR });
  const stdout = await build.stdout();
  const stderr = await build.stderr();
  output += [stdout, stderr].filter(Boolean).join("\n");
  if (build.exitCode !== 0) throw new Error(stderr || stdout || `npm run build exited with ${build.exitCode}`);

  let outputDir: string | null = null;
  for (const candidate of ["dist", "build", "out"]) {
    const check = await runTextCommand(sandbox, `test -d ${candidate}`, { allowFailure: true });
    if (check.exitCode === 0) { outputDir = candidate; break; }
  }
  if (!outputDir) throw new Error("Build completed but no dist, build, or out directory was found");

  const listing = await runTextCommand(sandbox, `find ${outputDir} -type f`);
  const paths = listing.output.split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (paths.length > MAX_BUILD_FILES) throw new Error(`Build produced too many files (${paths.length})`);

  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  for (const relativePath of paths) {
    const buffer = await sandbox.readFileToBuffer({ path: `${PROJECT_DIR}/${relativePath}` });
    if (!buffer) continue;
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BUILD_BYTES) throw new Error("Build output is too large to publish from Cryzo");
    files.push({ path: relativePath.slice(outputDir.length + 1), content: buffer.toString("utf8") });
  }
  return { files, output: output.slice(-12000) };
}

async function applyAction(sandbox: RemoteSandbox, action: ArtifactAction) {
  if (action.type === "file") {
    await writeFile(sandbox, action);
    return { progress: "writing" as const, output: `Wrote ${action.filePath}\n` };
  }
  if (action.type === "shell") {
    const isInstall = /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content.trim());
    const output = isInstall ? await runInstall(sandbox) : await runShell(sandbox, action.content.trim());
    return { progress: "installing" as const, output };
  }
  const result = await startPreview(sandbox);
  return { progress: "ready" as const, output: result.output, previewUrl: result.previewUrl };
}

async function restoreProject(sandbox: RemoteSandbox, actions: ArtifactAction[]) {
  const fileActions = actions.filter((action) => action.type === "file");
  const shellActions = actions.filter((action) => action.type === "shell");
  const startActions = actions.filter((action) => action.type === "start");
  for (const action of fileActions) await writeFile(sandbox, action);

  let output = `Restored ${fileActions.length} project files on ${sandbox.provider}.\n`;
  if (shellActions.some((action) => /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content))) {
    output += await ensureDependencies(sandbox);
  }
  let previewUrl: string | undefined;
  if (startActions.length > 0) {
    const result = await startPreview(sandbox, true);
    previewUrl = result.previewUrl;
    output += result.output;
  }
  return { progress: previewUrl ? ("ready" as const) : ("writing" as const), previewUrl, output: output.slice(-12000) };
}

function classifyRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/402|snapshot.*storage|usage limit exceeded/i.test(message)) {
    return "Preview compute quota is unavailable. Your generated files are safe; Cryzo can retry on another sandbox provider once configured.";
  }
  if (/modal.*token|MODAL_TOKEN|unauthenticated/i.test(message)) {
    return "Modal Sandbox authentication is not configured correctly.";
  }
  return message;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      operation?: "init" | "action" | "restore" | "status" | "build" | "restart" | "logs";
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
    if (body.operation === "init") {
      const ready = (await checkPublicPreview(sandbox)).ready;
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, previewUrl: ready ? sandbox.previewUrl : null, progress: ready ? "ready" : "writing" });
    }
    if (body.operation === "status") {
      const ready = (await checkPublicPreview(sandbox)).ready;
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, previewUrl: ready ? sandbox.previewUrl : null, progress: ready ? "ready" : "starting" });
    }
    if (body.operation === "restart") {
      const result = await startPreview(sandbox, true);
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, previewUrl: result.previewUrl, progress: "ready", output: result.output });
    }
    if (body.operation === "logs") {
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, output: await previewDiagnostics(sandbox) });
    }
    if (body.operation === "restore") {
      if (!Array.isArray(body.actions) || body.actions.length > 250) {
        return Response.json({ error: "Invalid restore actions" }, { status: 400 });
      }
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, ...(await restoreProject(sandbox, body.actions)) });
    }
    if (body.operation === "action" && body.action) {
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, ...(await applyAction(sandbox, body.action)) });
    }
    if (body.operation === "build") {
      return Response.json({ sandboxName: sandbox.name, provider: sandbox.provider, ...(await buildStaticProject(sandbox)) });
    }
    return Response.json({ error: "Unknown sandbox operation" }, { status: 400 });
  } catch (error) {
    console.error("[sandbox/runtime]", error);
    return Response.json({ error: classifyRuntimeError(error) }, { status: 500 });
  }
}
