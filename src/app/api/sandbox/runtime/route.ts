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
const MAX_BUILD_FILES = 500;
const MAX_BUILD_BYTES = 15_000_000;
const PREVIEW_PID_FILE = ".cryzo-preview.pid";
const PREVIEW_LOG_FILE = ".cryzo-preview.log";
const RUNTIME_DIR = ".cryzo";
const RUNTIME_CONFIG_FILE = `${RUNTIME_DIR}/vite.runtime.config.ts`;
const SAFE_VITE_5 = "5.4.21";
const VITE_CONFIG_CANDIDATES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs",
] as const;

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

function previewUrlFor(sandbox: Sandbox) {
  return sandbox.domain(PREVIEW_PORT);
}

function previewHostFor(sandbox: Sandbox) {
  return new URL(previewUrlFor(sandbox)).hostname;
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

async function writeProjectFiles(sandbox: Sandbox, actions: ArtifactAction[]) {
  const latestByPath = new Map<string, { path: string; content: Buffer }>();

  for (const action of actions) {
    if (!action.filePath) throw new Error("File action is missing filePath");
    if (Buffer.byteLength(action.content, "utf8") > MAX_FILE_BYTES) {
      throw new Error(`Generated file is too large: ${action.filePath}`);
    }
    const relative = safeRelativePath(action.filePath);
    latestByPath.set(relative, {
      path: `${PROJECT_DIR}/${relative}`,
      content: Buffer.from(action.content, "utf8"),
    });
  }

  const directories = Array.from(
    new Set(
      Array.from(latestByPath.keys())
        .map((relative) => path.posix.dirname(relative))
        .filter((directory) => directory !== ".")
        .map((directory) => `${PROJECT_DIR}/${directory}`),
    ),
  );
  if (directories.length > 0) {
    await sandbox.runCommand("mkdir", ["-p", ...directories]);
  }
  if (latestByPath.size > 0) {
    await sandbox.writeFiles(Array.from(latestByPath.values()));
  }
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

async function ensureDependencies(sandbox: Sandbox) {
  const check = await runTextCommand(sandbox, "test -d node_modules", {
    allowFailure: true,
  });
  if (check.exitCode !== 0) return await runInstall(sandbox);
  return "";
}

function parseVersion(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

async function getViteVersion(sandbox: Sandbox) {
  const result = await runTextCommand(
    sandbox,
    "node -p \"require('./node_modules/vite/package.json').version\"",
    { allowFailure: true },
  );
  return result.exitCode === 0 ? result.output.trim() : null;
}

async function ensureCompatibleVite(sandbox: Sandbox) {
  const version = await getViteVersion(sandbox);
  if (!version) {
    throw new Error("Vite is not installed in the project");
  }

  const parsed = parseVersion(version);
  if (!parsed) return `Vite ${version}\n`;

  const [major, minor, patch] = parsed;
  const unsafeVite5 = major === 5 && (minor < 4 || (minor === 4 && patch < 21));
  if (!unsafeVite5) return `Vite ${version}\n`;

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
  return `Upgraded Vite ${version} → ${SAFE_VITE_5}\n`;
}

async function findUserViteConfig(sandbox: Sandbox) {
  for (const candidate of VITE_CONFIG_CANDIDATES) {
    const result = await runTextCommand(sandbox, `test -f ${candidate}`, {
      allowFailure: true,
    });
    if (result.exitCode === 0) return candidate;
  }
  return null;
}

async function validateViteConfig(
  sandbox: Sandbox,
  relativePath: string,
) {
  const toolCheck = await runTextCommand(
    sandbox,
    "test -x ./node_modules/.bin/esbuild",
    { allowFailure: true },
  );
  if (toolCheck.exitCode !== 0) {
    return {
      valid: true,
      skipped: true,
      error: null as string | null,
    };
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const outputRelative = `${RUNTIME_DIR}/vite-config-check-${token}.js`;
  try {
    const result = await sandbox.runCommand({
      cmd: "./node_modules/.bin/esbuild",
      args: [relativePath, `--outfile=${outputRelative}`, "--log-level=error"],
      cwd: PROJECT_DIR,
    });
    const stdout = await result.stdout();
    const stderr = await result.stderr();
    return {
      valid: result.exitCode === 0,
      skipped: false,
      error: result.exitCode === 0
        ? null
        : (stderr || stdout || "Vite config contains invalid syntax").slice(-8000),
    };
  } finally {
    await runTextCommand(sandbox, `rm -f ${outputRelative}`, {
      allowFailure: true,
    });
  }
}

async function writeRuntimeViteConfig(
  sandbox: Sandbox,
  userConfigPath: string | null,
) {
  const publicHost = previewHostFor(sandbox);
  const importLine = userConfigPath
    ? `import userConfigExport from ${JSON.stringify(`../${userConfigPath}`)};`
    : "const userConfigExport = {};";

  const source = `import { defineConfig, mergeConfig } from "vite";\n${importLine}\n\nconst cryzoRuntimeConfig = {\n  server: {\n    host: "0.0.0.0",\n    port: ${PREVIEW_PORT},\n    strictPort: true,\n    allowedHosts: [${JSON.stringify(publicHost)}],\n  },\n};\n\nexport default defineConfig(async (env) => {\n  const candidate = typeof userConfigExport === "function"\n    ? await userConfigExport(env)\n    : await userConfigExport;\n  return mergeConfig(candidate || {}, cryzoRuntimeConfig);\n});\n`;

  await sandbox.runCommand("mkdir", ["-p", `${PROJECT_DIR}/${RUNTIME_DIR}`]);
  await sandbox.writeFiles([
    {
      path: `${PROJECT_DIR}/${RUNTIME_CONFIG_FILE}`,
      content: Buffer.from(source, "utf8"),
    },
  ]);

  return {
    publicHost,
    userConfigPath,
    source,
  };
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

async function checkPublicPreview(sandbox: Sandbox) {
  const url = previewUrlFor(sandbox);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "CryzoPreviewHealth/1.0",
      },
    });
    const body = (await response.text()).slice(0, 6000);
    const blockedHost = body.includes("Blocked request. This host");
    return {
      ready: response.ok && !blockedHost,
      status: response.status,
      blockedHost,
      body,
      error: null as string | null,
    };
  } catch (error) {
    return {
      ready: false,
      status: 0,
      blockedHost: false,
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function tailPreviewLog(sandbox: Sandbox) {
  const result = await runTextCommand(
    sandbox,
    `test -f ${PREVIEW_LOG_FILE} && tail -n 80 ${PREVIEW_LOG_FILE} || true`,
    { allowFailure: true },
  );
  return result.output.slice(-12000);
}

async function runtimeConfigDiagnostics(sandbox: Sandbox) {
  const result = await runTextCommand(
    sandbox,
    `test -f ${RUNTIME_CONFIG_FILE} && cat ${RUNTIME_CONFIG_FILE} || true`,
    { allowFailure: true },
  );
  return result.output.slice(-6000);
}

async function previewDiagnostics(sandbox: Sandbox) {
  const viteVersion = (await getViteVersion(sandbox)) || "missing";
  const packageInfo = await runTextCommand(
    sandbox,
    "node -e \"try{const p=require('./package.json'); console.log(JSON.stringify({name:p.name,scripts:p.scripts,devDependencies:p.devDependencies},null,2))}catch(e){console.error(String(e));process.exit(1)}\"",
    { allowFailure: true },
  );
  const processInfo = await runTextCommand(
    sandbox,
    `ps -ef | grep -E '[v]ite|[n]pm run dev' || true`,
    { allowFailure: true },
  );
  const portInfo = await runTextCommand(
    sandbox,
    `if command -v ss >/dev/null 2>&1; then ss -ltnp | grep ':${PREVIEW_PORT} ' || true; elif command -v lsof >/dev/null 2>&1; then lsof -iTCP:${PREVIEW_PORT} -sTCP:LISTEN || true; fi`,
    { allowFailure: true },
  );
  const runtimeConfig = await runtimeConfigDiagnostics(sandbox);
  const log = await tailPreviewLog(sandbox);

  return [
    `Preview URL: ${previewUrlFor(sandbox)}`,
    `Vite: ${viteVersion}`,
    packageInfo.output ? `package.json:\n${packageInfo.output}` : "",
    runtimeConfig ? `Cryzo runtime Vite config:\n${runtimeConfig}` : "Cryzo runtime Vite config: missing",
    processInfo.output ? `Processes:\n${processInfo.output}` : "",
    portInfo.output ? `Port ${PREVIEW_PORT}:\n${portInfo.output}` : "",
    log ? `Vite log:\n${log}` : "Vite log: empty",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(-18000);
}

async function stopPreview(sandbox: Sandbox) {
  await runTextCommand(
    sandbox,
    `
if [ -f ${PREVIEW_PID_FILE} ]; then
  pid=$(cat ${PREVIEW_PID_FILE} 2>/dev/null || true)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  fi
fi
rm -f ${PREVIEW_PID_FILE}
pkill -f '[v]ite.*--port ${PREVIEW_PORT}' 2>/dev/null || true
pkill -f '[v]ite.*${PREVIEW_PORT}' 2>/dev/null || true
`,
    { allowFailure: true },
  );

  for (let attempt = 0; attempt < 12; attempt++) {
    if (!(await isPreviewListening(sandbox).catch(() => false))) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

async function launchPreview(
  sandbox: Sandbox,
  userConfigPath: string | null,
) {
  const runtimeConfig = await writeRuntimeViteConfig(sandbox, userConfigPath);
  const command = `
rm -f ${PREVIEW_LOG_FILE} ${PREVIEW_PID_FILE}
nohup ./node_modules/.bin/vite --config ${RUNTIME_CONFIG_FILE} > ${PREVIEW_LOG_FILE} 2>&1 &
echo $! > ${PREVIEW_PID_FILE}
`;
  await runTextCommand(sandbox, command);
  return runtimeConfig;
}

async function startPreview(sandbox: Sandbox, forceRestart = false) {
  const previewUrl = previewUrlFor(sandbox);
  let output = await ensureDependencies(sandbox);
  output += await ensureCompatibleVite(sandbox);

  if (!forceRestart) {
    const existing = await checkPublicPreview(sandbox);
    if (existing.ready) {
      return {
        previewUrl,
        output: `${output}Preview already healthy at ${previewUrl}.\n`,
      };
    }
  }

  let userConfigPath = await findUserViteConfig(sandbox);
  if (userConfigPath) {
    const validation = await validateViteConfig(sandbox, userConfigPath);
    if (!validation.valid) {
      output += `Ignored invalid ${userConfigPath} before preview startup: ${validation.error || "syntax error"}\n`;
      userConfigPath = null;
    } else if (validation.skipped) {
      output += `Could not run the Vite config preflight because esbuild is unavailable; using the generated config as-is.\n`;
    }
  }

  await stopPreview(sandbox);
  const runtimeConfig = await launchPreview(sandbox, userConfigPath);
  output += `Cryzo runtime config: ${runtimeConfig.userConfigPath || "no user vite.config found"} + ${runtimeConfig.publicHost}\n`;

  let listening = false;
  for (let attempt = 0; attempt < 60 && !listening; attempt++) {
    listening = await isPreviewListening(sandbox).catch(() => false);
    if (!listening) await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!listening) {
    const diagnostics = await previewDiagnostics(sandbox);
    throw new Error(`Preview server did not listen on port ${PREVIEW_PORT}.\n\n${diagnostics}`);
  }

  let lastCheck = await checkPublicPreview(sandbox);
  for (let attempt = 0; attempt < 4 && !lastCheck.ready; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    lastCheck = await checkPublicPreview(sandbox);
  }

  if (!lastCheck.ready) {
    const diagnostics = await previewDiagnostics(sandbox);
    const reason = lastCheck.blockedHost
      ? `Vite rejected the sandbox host ${previewHostFor(sandbox)}`
      : lastCheck.status
        ? `Public preview returned HTTP ${lastCheck.status}`
        : `Public preview could not be reached${lastCheck.error ? `: ${lastCheck.error}` : ""}`;
    throw new Error(`${reason}.\n\n${diagnostics}`);
  }

  return {
    previewUrl,
    output: `${output}Preview server ready at ${previewUrl}.\n`,
  };
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

async function buildStaticProject(sandbox: Sandbox) {
  let output = await ensureDependencies(sandbox);
  const build = await sandbox.runCommand({
    cmd: "npm",
    args: ["run", "build"],
    cwd: PROJECT_DIR,
  });
  const stdout = await build.stdout();
  const stderr = await build.stderr();
  output += [stdout, stderr].filter(Boolean).join("\n");
  if (build.exitCode !== 0) {
    throw new Error(stderr || stdout || `npm run build exited with ${build.exitCode}`);
  }

  let outputDir: string | null = null;
  for (const candidate of ["dist", "build", "out"]) {
    const check = await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", `test -d ${candidate}`],
      cwd: PROJECT_DIR,
    });
    if (check.exitCode === 0) {
      outputDir = candidate;
      break;
    }
  }

  if (!outputDir) {
    throw new Error("Build completed but no dist, build, or out directory was found");
  }

  const listing = await sandbox.runCommand({
    cmd: "find",
    args: [outputDir, "-type", "f"],
    cwd: PROJECT_DIR,
  });
  const listingStdout = await listing.stdout();
  if (listing.exitCode !== 0) throw new Error("Failed to enumerate build output");

  const paths = listingStdout
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (paths.length > MAX_BUILD_FILES) {
    throw new Error(`Build produced too many files (${paths.length})`);
  }

  const files: Array<{ path: string; content: string }> = [];
  let totalBytes = 0;
  for (const relativePath of paths) {
    const buffer = await sandbox.readFileToBuffer({
      path: `${PROJECT_DIR}/${relativePath}`,
    });
    if (!buffer) continue;
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_BUILD_BYTES) {
      throw new Error("Build output is too large to publish from Cryzo");
    }
    files.push({
      path: relativePath.slice(outputDir.length + 1),
      content: buffer.toString("utf8"),
    });
  }

  return {
    files,
    output: output.slice(-12000),
  };
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

  const result = await startPreview(sandbox);
  return {
    progress: "ready" as const,
    output: result.output,
    previewUrl: result.previewUrl,
  };
}

async function restoreProject(sandbox: Sandbox, actions: ArtifactAction[]) {
  const fileActions = actions.filter((action) => action.type === "file");
  const shellActions = actions.filter((action) => action.type === "shell");
  const startActions = actions.filter((action) => action.type === "start");

  await writeProjectFiles(sandbox, fileActions);

  let output = `Restored ${fileActions.length} project files in one checkpoint.\n`;
  if (shellActions.some((action) => /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content))) {
    output += await ensureDependencies(sandbox);
  }

  let previewUrl: string | undefined;
  if (startActions.length > 0) {
    const result = await startPreview(sandbox, true);
    previewUrl = result.previewUrl;
    output += result.output;
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
      operation?: "init" | "action" | "actions" | "restore" | "status" | "build" | "restart" | "logs";
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
    const previewBase = previewUrlFor(sandbox);

    if (body.operation === "init") {
      const ready = (await checkPublicPreview(sandbox)).ready;
      return Response.json({
        sandboxName: sandbox.name,
        previewUrl: ready ? previewBase : null,
        progress: ready ? "ready" : "writing",
      });
    }

    if (body.operation === "status") {
      const ready = (await checkPublicPreview(sandbox)).ready;
      return Response.json({
        sandboxName: sandbox.name,
        previewUrl: ready ? previewBase : null,
        progress: ready ? "ready" : "starting",
      });
    }

    if (body.operation === "restart") {
      const result = await startPreview(sandbox, true);
      return Response.json({
        sandboxName: sandbox.name,
        previewUrl: result.previewUrl,
        progress: "ready",
        output: result.output,
      });
    }

    if (body.operation === "logs") {
      return Response.json({
        sandboxName: sandbox.name,
        output: await previewDiagnostics(sandbox),
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

    if (body.operation === "actions") {
      if (!Array.isArray(body.actions) || body.actions.length > 250) {
        return Response.json({ error: "Invalid actions" }, { status: 400 });
      }
      const fileActions = body.actions.filter((action) => action.type === "file");
      if (fileActions.length !== body.actions.length) {
        return Response.json(
          { error: "Batched actions may only contain files" },
          { status: 400 },
        );
      }
      await writeProjectFiles(sandbox, fileActions);
      return Response.json({
        sandboxName: sandbox.name,
        progress: "writing",
        output: `Wrote ${fileActions.length} files in one checkpoint.\n`,
      });
    }

    if (body.operation === "build") {
      const result = await buildStaticProject(sandbox);
      return Response.json({ sandboxName: sandbox.name, ...result });
    }

    return Response.json({ error: "Unknown sandbox operation" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[sandbox/runtime]", error);
    return Response.json({ error: message }, { status: 500 });
  }
}
