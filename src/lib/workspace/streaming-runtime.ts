import type { ArtifactAction, FileMap } from "./types";
import { missingReactViteScaffold, projectReadinessIssues } from "./project-scaffold";
import { analyzeProject } from "./project-integrity";
import type { ProgressStage } from "./action-runner";
import {
  collectDirectoryFiles,
  directoryExists,
  getSandbox,
  runCommand,
  teardownSandbox,
  writeFiles,
} from "./sandbox";
import { readSupabaseRuntimeContext } from "@/lib/developer-connections";

export interface StreamingRuntimeSnapshot {
  active: boolean;
  files: FileMap;
  previewUrl: string | null;
  terminalOutput: string;
  progress: ProgressStage;
  error: string | null;
}

export type SandboxBuildFile = {
  path: string;
  content: string;
};

type Listener = (snapshot: StreamingRuntimeSnapshot) => void;
type KillableProcess = { kill: () => void };

type RuntimeState = StreamingRuntimeSnapshot & {
  listeners: Set<Listener>;
  processedActionsByMessage: Map<string, number>;
  queue: Promise<void>;
  initialized: boolean;
  restoreQueued: boolean;
  blockedMessageId: string | null;
  verifiedBuild: string | null;
  devProcess: KillableProcess | null;
  startCommand: string | null;
  installedPackageJson: string | null;
  installedRequirements: string | null;
  serverReadyTimer: ReturnType<typeof setTimeout> | null;
};

const runtimes = new Map<string, RuntimeState>();
let sandboxAuthToken: string | null = null;
let activeConversationId: string | null = null;

export function setStreamingRuntimeAuthToken(token: string | null) {
  sandboxAuthToken = token;
}

async function waitForSandboxAuthToken() {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (sandboxAuthToken) return sandboxAuthToken;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Authentication is still loading. Please retry.");
}

function createState(): RuntimeState {
  return {
    active: false,
    files: {},
    previewUrl: null,
    terminalOutput: "",
    progress: "idle",
    error: null,
    listeners: new Set(),
    processedActionsByMessage: new Map(),
    queue: Promise.resolve(),
    initialized: false,
    restoreQueued: false,
    blockedMessageId: null,
    verifiedBuild: null,
    devProcess: null,
    startCommand: null,
    installedPackageJson: null,
    installedRequirements: null,
    serverReadyTimer: null,
  };
}

function getState(conversationId: string): RuntimeState {
  let state = runtimes.get(conversationId);
  if (!state) {
    state = createState();
    runtimes.set(conversationId, state);
  }
  return state;
}

function snapshot(state: RuntimeState): StreamingRuntimeSnapshot {
  return {
    active: state.active,
    files: { ...state.files },
    previewUrl: state.previewUrl,
    terminalOutput: state.terminalOutput,
    progress: state.progress,
    error: state.error,
  };
}

function emit(state: RuntimeState) {
  const next = snapshot(state);
  for (const listener of state.listeners) listener(next);
}

function appendOutput(state: RuntimeState, data: string) {
  if (!data) return;
  state.terminalOutput = `${state.terminalOutput}${data}`.slice(-50000);
}

function clearServerReadyTimer(state: RuntimeState) {
  if (state.serverReadyTimer) clearTimeout(state.serverReadyTimer);
  state.serverReadyTimer = null;
}

function setError(state: RuntimeState, error: unknown) {
  clearServerReadyTimer(state);
  const message = error instanceof Error ? error.message : String(error);
  state.error = message;
  state.progress = "error";
  appendOutput(state, `\nError: ${message}\n`);
  emit(state);
}

function updateFileMap(state: RuntimeState, action: ArtifactAction) {
  if (action.type !== "file" || !action.filePath) return;
  const filePath = action.filePath.replace(/^\.\//, "").replace(/^\/+/, "");
  state.files[filePath] = { type: "file", content: action.content };
  state.verifiedBuild = null;
  const parts = filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (!state.files[dir]) state.files[dir] = { type: "folder" };
  }
}

function fileMapFromActions(actions: ArtifactAction[]) {
  const files: FileMap = {};
  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;
    const filePath = action.filePath.replace(/^\.\//, "").replace(/^\/+/, "");
    files[filePath] = { type: "file", content: action.content };
    const parts = filePath.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!files[dir]) files[dir] = { type: "folder" };
    }
  }
  return files;
}

function parseActionAttributes(raw: string) {
  const type = raw.match(/type="([^"]+)"/)?.[1] as ArtifactAction["type"] | undefined;
  const filePath = raw.match(/filePath="([^"]+)"/)?.[1];
  const operation = raw.match(/operation="([^"]+)"/)?.[1] as ArtifactAction["operation"] | undefined;
  return { type, filePath, operation };
}

function parseCompletedActions(text: string): ArtifactAction[] {
  if (!text.includes("<cryzoArtifact")) return [];

  const actions: ArtifactAction[] = [];
  const pattern = /<cryzoAction([^>]*)>([\s\S]*?)<\/cryzoAction>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const { type, filePath, operation } = parseActionAttributes(match[1]);
    if (!type) continue;
    actions.push({ type, filePath, operation, content: match[2] });
  }

  return actions;
}

function hasUnclosedArtifact(text: string) {
  const openCount = text.match(/<cryzoArtifact\b/g)?.length ?? 0;
  const closeCount = text.match(/<\/cryzoArtifact>/g)?.length ?? 0;
  return openCount > closeCount;
}

type GuardResponse = {
  action?: ArtifactAction;
  actions?: ArtifactAction[];
  repairedFiles?: SandboxBuildFile[];
  output?: string;
  repaired?: boolean;
  error?: string;
};

async function authenticatedPost<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const authToken = await waitForSandboxAuthToken();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

async function callGuard(body: Record<string, unknown>): Promise<GuardResponse> {
  return await authenticatedPost<GuardResponse>("/api/sandbox/validate", body);
}

function stopDevProcess(state: RuntimeState) {
  clearServerReadyTimer(state);
  const current = state.devProcess;
  state.devProcess = null;
  if (current) {
    try {
      current.kill();
    } catch {
      // The process may already have exited.
    }
  }
}

async function ensureContainer(conversationId: string, state: RuntimeState) {
  if (activeConversationId && activeConversationId !== conversationId) {
    const previous = getState(activeConversationId);
    await previous.queue.catch(() => undefined); // Finish queued writes before clearing the singleton filesystem.
    stopDevProcess(previous);
    previous.active = false;
    previous.previewUrl = null;
    previous.initialized = false;
    previous.restoreQueued = false;
    previous.blockedMessageId = null;
    previous.verifiedBuild = null;
    previous.files = {}; // Vivari has one project directory: it will be cleared on switch.
    previous.installedPackageJson = null;
    previous.installedRequirements = null;
    previous.startCommand = null;
    previous.processedActionsByMessage.clear();
    previous.progress = "idle";
    emit(previous);
    await teardownSandbox();
    activeConversationId = null;
  }

  const wc = await getSandbox();
  if (activeConversationId !== conversationId) {
    activeConversationId = conversationId;

    wc.on("server-ready", (_port, url) => {
      if (activeConversationId !== conversationId) return;
      clearServerReadyTimer(state);
      if (state.progress === "error") return;
      state.previewUrl = url;
      state.progress = "ready";
      state.error = null;
      appendOutput(state, `\nPreview ready at ${url}\n`);
      emit(state);
    });

    wc.on("preview-message", (message: any) => {
      if (activeConversationId !== conversationId) return;
      if (
        message?.type !== "PREVIEW_UNCAUGHT_EXCEPTION" &&
        message?.type !== "PREVIEW_UNHANDLED_REJECTION"
      ) {
        return;
      }
      const title =
        message.type === "PREVIEW_UNHANDLED_REJECTION"
          ? "Unhandled promise rejection"
          : "Uncaught preview exception";
      const detail = `${title}: ${message.message || "Unknown error"}${message.stack ? `\n${message.stack}` : ""}`;
      appendOutput(state, `\n${detail}\n`);
      state.error = detail;
      state.progress = "error";
      emit(state);
    });
  }

  return wc;
}

async function applyRepairedFiles(
  conversationId: string,
  state: RuntimeState,
  files?: SandboxBuildFile[],
) {
  if (!files?.length) return false;
  const wc = await ensureContainer(conversationId, state);
  const actions: ArtifactAction[] = files.map((file) => ({
    type: "file",
    filePath: file.path,
    content: file.content,
  }));
  await writeFiles(wc, actions);
  for (const action of actions) updateFileMap(state, action);
  emit(state);
  return true;
}

function packageJsonContent(state: RuntimeState) {
  return state.files["package.json"]?.type === "file"
    ? state.files["package.json"]?.content || ""
    : "";
}

/** Repair a missing manifest with an explicit, non-destructive web scaffold. */
async function ensureProjectScaffold(conversationId: string, state: RuntimeState) {
  const missing = missingReactViteScaffold(state.files);
  if (!missing.length) return;
  const wc = await ensureContainer(conversationId, state);
  const actions: ArtifactAction[] = missing.map(({ path, content }) => ({
    type: "file", filePath: path, content,
  }));
  await writeFiles(wc, actions);
  for (const action of actions) updateFileMap(state, action);
  state.installedPackageJson = null;
  appendOutput(state, `\nRestored ${missing.length} missing React/Vite starter files without overwriting generated code.\n`);
  emit(state);
}

async function assertRunnableProject(conversationId: string, state: RuntimeState, command?: string) {
  const issues = projectReadinessIssues(state.files, command);
  if (issues.length) throw new Error(issues.join(" "));
  if (packageJsonContent(state)) {
    const wc = await ensureContainer(conversationId, state);
    if (!(await wc.fs.exists("package.json"))) {
      throw new Error("The Vivari project directory is missing package.json. Restore project files before running npm.");
    }
  }
}

async function validateCurrentProject(conversationId: string, state: RuntimeState, command?: string) {
  await assertRunnableProject(conversationId, state, command);
  const projectFiles = Object.entries(state.files)
    .filter(([, value]) => value.type === "file")
    .map(([path, value]) => ({ path, content: value.content || "" }));
  return callGuard({ operation: "project", conversationId, projectFiles, command });
}

function detectStartCommand(state: RuntimeState) {
  const packageJson = packageJsonContent(state);
  if (!packageJson) return null;
  try {
    const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    if (pkg.scripts?.dev) return "npm run dev";
    if (pkg.scripts?.start) return "npm run start";
    if (pkg.scripts?.preview) return "npm run preview";
  } catch {
    return null;
  }
  return null;
}

function fileContent(state: RuntimeState, path: string) {
  return state.files[path]?.type === "file" ? state.files[path]?.content || "" : "";
}

function usesBun(state: RuntimeState) {
  return state.files["bun.lock"]?.type === "file" || state.files["bun.lockb"]?.type === "file";
}

// Python projects (run on Vivari's CPython) declare dependencies in requirements.txt.
async function ensurePythonDependencies(conversationId: string, state: RuntimeState) {
  const requirements = fileContent(state, "requirements.txt");
  if (!requirements.trim() || state.installedRequirements === requirements) return;

  const wc = await ensureContainer(conversationId, state);
  state.progress = "installing";
  state.error = null;
  appendOutput(state, "\nInstalling Python packages in the Cryzo runtime...\n");
  emit(state);

  const exitCode = await runCommand(wc, "pip install -r requirements.txt", (data) => {
    appendOutput(state, data);
    emit(state);
  });
  if (exitCode !== 0) {
    throw new Error(`pip install exited with code ${exitCode}`);
  }
  state.installedRequirements = requirements;
}

/** Reconcile known packages before npm runs; surface every remaining unresolved import. */
async function ensureProjectIntegrity(conversationId: string, state: RuntimeState) {
  const analysis = analyzeProject(state.files, true);
  if (analysis.repairedFiles.length) {
    const wc = await ensureContainer(conversationId, state);
    const actions: ArtifactAction[] = analysis.repairedFiles.map(({ path, content }) => ({
      type: "file", filePath: path, content,
    }));
    await writeFiles(wc, actions);
    for (const action of actions) updateFileMap(state, action);
    state.installedPackageJson = null;
    appendOutput(state, `\nReconciled ${actions.length} dependency/config file(s).\n`);
    emit(state);
  }
  const remaining = analyzeProject(state.files).diagnostics;
  if (remaining.length) throw new Error(`Project preflight failed:\n${remaining.slice(0, 12).map((d) => `- ${d.message}`).join("\n")}`);
}

/** Compile a Vite web app before claiming its dev-server preview is healthy. */
async function verifyWebBuild(conversationId: string, state: RuntimeState) {
  const json = packageJsonContent(state);
  if (!json) return;
  const pkg = JSON.parse(json) as { scripts?: Record<string, string> };
  const build = pkg.scripts?.build?.trim();
  if (!build || !/^(?:vite build|tsc(?:\s+[^&]+)?\s*&&\s*vite build)(?:\s|$)/.test(build)) return;
  const fingerprint = JSON.stringify(Object.entries(state.files).filter(([, f]) => f.type === "file"));
  if (state.verifiedBuild === fingerprint) return;
  const wc = await ensureContainer(conversationId, state);
  state.progress = "starting";
  appendOutput(state, "\nChecking Vite production compilation before preview...\n");
  emit(state);
  let output = "";
  const code = await runCommand(wc, "npm run build", (data) => {
    output = (output + data).slice(-8000);
    appendOutput(state, data);
    emit(state);
  });
  if (code !== 0) {
    throw new Error(`Generated project failed its Vite build (${code}).\n${output.slice(-4500)}`);
  }
  state.verifiedBuild = fingerprint;
}

async function ensureDependencies(conversationId: string, state: RuntimeState) {
  await ensureProjectScaffold(conversationId, state);
  await ensureProjectIntegrity(conversationId, state);
  await ensurePythonDependencies(conversationId, state);

  const packageJson = packageJsonContent(state);
  if (!packageJson) return;
  await assertRunnableProject(conversationId, state);

  const wc = await ensureContainer(conversationId, state);
  const nodeModules = await directoryExists(wc, "node_modules");
  if (nodeModules && state.installedPackageJson === packageJson) return;

  state.progress = "installing";
  state.error = null;
  appendOutput(
    state,
    nodeModules
      ? "\npackage.json changed; updating dependencies...\n"
      : "\nInstalling dependencies in the Cryzo runtime...\n",
  );
  emit(state);

  const installCommand = usesBun(state) ? "bun install" : "npm install --no-audit --no-fund";
  const exitCode = await runCommand(wc, installCommand, (data) => {
    appendOutput(state, data);
    emit(state);
  });
  if (exitCode !== 0) {
    throw new Error(`${installCommand.split(" --")[0]} exited with code ${exitCode}`);
  }
  state.installedPackageJson = packageJson;
}

async function startDevServer(
  conversationId: string,
  state: RuntimeState,
  command: string,
) {
  await assertRunnableProject(conversationId, state, command);
  const wc = await ensureContainer(conversationId, state);
  stopDevProcess(state);
  state.startCommand = command.trim();
  state.previewUrl = null;
  state.progress = "starting";
  state.error = null;
  appendOutput(state, `\n$ ${state.startCommand}\n`);
  emit(state);

  const process = await wc.spawnShell(state.startCommand);
  state.devProcess = process;

  void process.output
    .pipeTo(
      new WritableStream({
        write(data) {
          if (state.devProcess !== process) return;
          appendOutput(state, data);
          emit(state);
        },
      }),
    )
    .catch(() => {});

  state.serverReadyTimer = setTimeout(() => {
    if (state.devProcess === process && !state.previewUrl) {
      setError(
        state,
        "The dev server did not expose a preview URL. Check the terminal output and the project's dev script.",
      );
    }
  }, 60000);

  void process.exit.then((code) => {
    if (state.devProcess !== process) return;
    state.devProcess = null;
    clearServerReadyTimer(state);
    if (code !== 0 && !state.previewUrl) {
      setError(state, `Preview process exited with code ${code}`);
    }
  });
}

function isInstallAction(action: ArtifactAction) {
  return (
    action.type === "shell" &&
    /(^|\s)((npm|pnpm|yarn|bun)\s+(install|i|add)|pip3?\s+install|python3?\s+-m\s+pip\s+install)(\s|$)/.test(
      action.content.trim(),
    )
  );
}

async function executeSupabaseAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  const context = readSupabaseRuntimeContext();
  if (!context) {
    throw new Error(
      "This project requested a Supabase action, but no Supabase project is selected in Developer Connections.",
    );
  }

  state.progress = state.previewUrl ? "ready" : "writing";
  appendOutput(
    state,
    `\nSupabase ${action.operation || "query"} → ${context.project.name}\n`,
  );
  emit(state);

  await authenticatedPost("/api/developer/supabase/runtime", {
    conversationId,
    project: context.project,
  });

  const response = await fetch("/api/developer/supabase/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: context.token,
      projectRef: context.project.ref,
      query: action.content,
      allowDestructive: false,
    }),
  });
  const data = (await response.json()) as { success?: boolean; error?: string };
  if (!response.ok) throw new Error(data.error || "Supabase action failed");

  appendOutput(state, `Supabase ${action.operation || "query"} completed.\n`);
  state.error = null;
  emit(state);
}

export async function syncSupabaseRuntime(conversationId: string) {
  const context = readSupabaseRuntimeContext();
  if (!context) return false;
  await authenticatedPost("/api/developer/supabase/runtime", {
    conversationId,
    project: context.project,
  });
  return true;
}

async function executeSandboxAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  if (action.type === "supabase") {
    await executeSupabaseAction(conversationId, state, action);
    return;
  }

  const wc = await ensureContainer(conversationId, state);
  let safeAction = action;

  if (action.type === "file") {
    const validation = await callGuard({
      operation: "file",
      conversationId,
      action,
    });
    if (!validation.action) {
      throw new Error(
        `Generated file validation returned no action for ${action.filePath || "unknown file"}`,
      );
    }
    safeAction = validation.action;
    if (validation.output) appendOutput(state, validation.output);

    await writeFiles(wc, [safeAction]);
    updateFileMap(state, safeAction);
    if (safeAction.filePath === "package.json") state.installedPackageJson = null;
    if (safeAction.filePath === "requirements.txt") state.installedRequirements = null;
    state.progress = state.previewUrl ? "ready" : "writing";
    state.error = null;
    appendOutput(state, `Wrote ${safeAction.filePath}\n`);
    emit(state);
    return;
  }

  if (action.type === "shell") {
    if (isInstallAction(action)) {
      await ensureProjectScaffold(conversationId, state);
      await ensureProjectIntegrity(conversationId, state);
    }
    await assertRunnableProject(conversationId, state, action.content);
    state.progress = isInstallAction(action) ? "installing" : state.previewUrl ? "ready" : "writing";
    state.error = null;
    appendOutput(state, `\n$ ${action.content}\n`);
    emit(state);

    const exitCode = await runCommand(wc, action.content.trim(), (data) => {
      appendOutput(state, data);
      emit(state);
    });
    if (exitCode !== 0) throw new Error(`Command exited with code ${exitCode}: ${action.content}`);

    if (isInstallAction(action)) {
      state.installedPackageJson = packageJsonContent(state) || state.installedPackageJson;
      if (/\bpip3?\b/.test(action.content)) {
        state.installedRequirements = fileContent(state, "requirements.txt") || state.installedRequirements;
      }
      const validation = await validateCurrentProject(conversationId, state);
      if (validation.output) appendOutput(state, validation.output);
      await applyRepairedFiles(conversationId, state, validation.repairedFiles);
    }
    state.error = null;
    emit(state);
    return;
  }

  await ensureDependencies(conversationId, state);
  await validateCurrentProject(conversationId, state, action.content);
  await verifyWebBuild(conversationId, state);
  await startDevServer(conversationId, state, action.content);
}

export async function saveStreamingRuntimeFile(
  conversationId: string,
  filePath: string,
  content: string,
) {
  const state = getState(conversationId);
  state.active = true;
  state.error = null;

  const requested: ArtifactAction = {
    type: "file",
    filePath,
    content,
  };
  const validation = await callGuard({
    operation: "file",
    conversationId,
    action: requested,
  });
  if (!validation.action || validation.action.type !== "file" || !validation.action.filePath) {
    throw new Error(`File validation returned no writable action for ${filePath}`);
  }

  const safeAction = validation.action as ArtifactAction & { filePath: string };
  const wc = await ensureContainer(conversationId, state);
  await writeFiles(wc, [safeAction]);
  updateFileMap(state, safeAction);
  if (validation.output) appendOutput(state, validation.output);
  appendOutput(state, `Wrote ${safeAction.filePath}\n`);
  state.progress = state.previewUrl ? "ready" : "writing";
  emit(state);

  const needsInstall = /(^|\/)package\.json$/i.test(safeAction.filePath);
  const needsRestart =
    needsInstall ||
    /(^|\/)(vite\.config\.(ts|js|mts|mjs|cts|cjs)|next\.config\.(ts|js|mts|mjs|cts|cjs)|index\.html)$/i.test(
      safeAction.filePath,
    );

  if (needsInstall) {
    state.installedPackageJson = null;
    await ensureDependencies(conversationId, state);
  }

  if (needsRestart) {
    const startCommand = state.startCommand || detectStartCommand(state);
    if (startCommand) {
      await ensureDependencies(conversationId, state);
      await verifyWebBuild(conversationId, state);
      await startDevServer(conversationId, state, startCommand);
    }
  }

  return {
    filePath: safeAction.filePath,
    content: safeAction.content,
  };
}

export function processStreamingArtifactText(
  conversationId: string,
  messageId: string,
  text: string,
) {
  if (!text.includes("<cryzoArtifact")) return false;

  const state = getState(conversationId);
  if (state.blockedMessageId === messageId) return true;
  if (!state.active) state.active = true;
  state.error = null;

  // While the model is still producing the artifact, "writing" means this is
  // new AI output — never project restoration from persisted files.
  if (hasUnclosedArtifact(text)) {
    if (state.progress !== "writing") {
      state.progress = "writing";
      emit(state);
    }
    return true;
  }

  const actions = parseCompletedActions(text);
  const processed = state.processedActionsByMessage.get(messageId) ?? 0;
  if (actions.length <= processed) return true;

  const newActions = actions.slice(processed);
  state.processedActionsByMessage.set(messageId, actions.length);
  state.progress = "writing";
  emit(state);

  for (const action of newActions) {
    state.queue = state.queue
      .then(() => {
        if (state.blockedMessageId === messageId) return; // Fail closed for dependent steps.
        return executeSandboxAction(conversationId, state, action);
      })
      .catch((error) => {
        if (state.blockedMessageId === messageId) return;
        state.blockedMessageId = messageId;
        setError(state, error);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("cryzo:project-repair-needed", {
            detail: { conversationId, message: error instanceof Error ? error.message.slice(0, 3500) : String(error).slice(0, 3500) },
          }));
        }
      });
  }

  return true;
}

export async function prebootStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  if (state.initialized) return;
  state.initialized = true;
  state.error = null;

  // Prebooting only warms the singleton Cryzo runtime. It is not a file write
  // and should never put a reloaded chat into a "Writing files" state.
  if (!state.active) state.progress = "idle";
  emit(state);

  try {
    await ensureContainer(conversationId, state);
    appendOutput(state, "Cryzo runtime ready.\n");
    emit(state);
    await syncSupabaseRuntime(conversationId).catch(() => false);
  } catch (error) {
    state.initialized = false;
    state.active = false;
    setError(state, error);
    throw error;
  }
}

export async function restoreStreamingRuntime(
  conversationId: string,
  actions: ArtifactAction[],
) {
  const state = getState(conversationId);
  if (state.restoreQueued || Object.keys(state.files).length > 0 || actions.length === 0) return;
  state.restoreQueued = true;
  // Restoration and live AI file/shell actions share one queue. Nothing starts
  // before persisted project files have been written to Vivari.
  const restoreTask = state.queue.then(async () => {
  state.active = true;
  state.progress = "restoring";
  state.error = null;
  appendOutput(state, "Restoring project in the Cryzo runtime...\n");
  emit(state);

  try {
    const nonSupabase = actions.filter((action) => action.type !== "supabase");
    const guarded = await callGuard({
      operation: "actions",
      conversationId,
      actions: nonSupabase,
    });
    const safeNonSupabase = guarded.actions || nonSupabase;
    const safeActions = [
      ...safeNonSupabase,
      ...actions.filter((action) => action.type === "supabase"),
    ];
    if (guarded.output) appendOutput(state, guarded.output);
    state.files = fileMapFromActions(safeActions);
    emit(state);

    const wc = await ensureContainer(conversationId, state);
    const fileActions = safeNonSupabase.filter((action) => action.type === "file");
    await writeFiles(wc, fileActions);
    appendOutput(state, `Restored ${fileActions.length} project files.\n`);
    await ensureProjectScaffold(conversationId, state);

    await syncSupabaseRuntime(conversationId).catch(() => false);

    if (
      safeNonSupabase.some(isInstallAction) ||
      packageJsonContent(state) ||
      fileContent(state, "requirements.txt")
    ) {
      await ensureDependencies(conversationId, state);
    }

    const validation = await validateCurrentProject(conversationId, state);
    if (validation.output) appendOutput(state, validation.output);
    await applyRepairedFiles(conversationId, state, validation.repairedFiles);

    const startActions = safeNonSupabase.filter((action) => action.type === "start");
    const explicitStart = startActions.length
      ? startActions[startActions.length - 1].content
      : null;
    const startCommand = explicitStart || detectStartCommand(state);
    if (startCommand) {
      await verifyWebBuild(conversationId, state);
      await startDevServer(conversationId, state, startCommand);
    } else {
      state.progress = "idle";
      appendOutput(state, "No dev/start script found; project files are available in the editor.\n");
      emit(state);
    }
  } catch (error) {
    state.active = false;
    state.restoreQueued = false;
    setError(state, error);
  }
  });
  state.queue = restoreTask;
  await restoreTask;
}

export async function restartStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  await state.queue;
  state.active = true;
  state.progress = "starting";
  state.error = null;
  appendOutput(state, "\nRestarting preview server...\n");
  emit(state);

  try {
    await ensureContainer(conversationId, state);
    await syncSupabaseRuntime(conversationId).catch(() => false);
    await ensureDependencies(conversationId, state);
    const validation = await validateCurrentProject(conversationId, state);
    if (validation.output) appendOutput(state, validation.output);
    await applyRepairedFiles(conversationId, state, validation.repairedFiles);
    await verifyWebBuild(conversationId, state);

    const startCommand = state.startCommand || detectStartCommand(state);
    if (!startCommand) throw new Error("No dev/start script found in package.json");
    await startDevServer(conversationId, state, startCommand);
  } catch (error) {
    setError(state, error);
    throw error;
  }
}

export async function refreshStreamingRuntimeLogs(conversationId: string) {
  const state = getState(conversationId);
  const diagnostics = [
    "--- Cryzo runtime diagnostics (Vivari) ---",
    `Conversation: ${conversationId}`,
    `Cross-origin isolated: ${typeof window !== "undefined" ? window.crossOriginIsolated : "unknown"}`,
    `Preview URL: ${state.previewUrl || "not ready"}`,
    `Start command: ${state.startCommand || detectStartCommand(state) || "none"}`,
  ].join("\n");
  appendOutput(state, `\n${diagnostics}\n`);
  emit(state);
  return diagnostics;
}

export async function buildStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  await state.queue;
  const wc = await ensureContainer(conversationId, state);
  await syncSupabaseRuntime(conversationId).catch(() => false);
  await ensureDependencies(conversationId, state);
  const validation = await validateCurrentProject(conversationId, state);
  if (validation.output) appendOutput(state, validation.output);
  await applyRepairedFiles(conversationId, state, validation.repairedFiles);

  const packageJson = packageJsonContent(state);
  if (!packageJson) throw new Error("Project has no package.json to build");
  try {
    const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.build) throw new Error("Project has no npm build script");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Project package.json is invalid");
    throw error;
  }

  appendOutput(state, "\n$ npm run build (Cryzo runtime)\n");
  emit(state);
  let buildOutput = "";
  const exitCode = await runCommand(wc, "npm run build", (data) => {
    buildOutput = `${buildOutput}${data}`.slice(-12000);
    appendOutput(state, data);
    emit(state);
  });
  if (exitCode !== 0) throw new Error(`npm run build exited with code ${exitCode}`);

  let outputDir: string | null = null;
  for (const candidate of ["dist", "build", "out"]) {
    if (await directoryExists(wc, candidate)) {
      outputDir = candidate;
      break;
    }
  }
  if (!outputDir) {
    throw new Error("Build completed but no dist, build, or out directory was found");
  }

  const files = await collectDirectoryFiles(wc, outputDir, {
    maxFiles: 500,
    maxBytes: 15_000_000,
  });
  if (files.length === 0) throw new Error("The build produced no publishable files");
  return { files, output: buildOutput };
}

export function subscribeStreamingRuntime(
  conversationId: string,
  listener: Listener,
) {
  const state = getState(conversationId);
  state.listeners.add(listener);
  listener(snapshot(state));
  return () => {
    state.listeners.delete(listener);
  };
}

export function getStreamingRuntimeSnapshot(conversationId: string) {
  return snapshot(getState(conversationId));
}

export function isStreamingRuntimeActive(conversationId: string) {
  const state = getState(conversationId);
  return state.active && Object.keys(state.files).length > 0;
}
