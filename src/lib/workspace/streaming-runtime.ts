import type { ArtifactAction, FileMap } from "./types";
import type { ProgressStage } from "./action-runner";
import {
  collectDirectoryFiles,
  directoryExists,
  getWebContainer,
  runCommand,
  teardownWebContainer,
  writeFiles,
} from "./webcontainer";
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
  devProcess: KillableProcess | null;
  startCommand: string | null;
  installedPackageJson: string | null;
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
    devProcess: null,
    startCommand: null,
    installedPackageJson: null,
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
    stopDevProcess(previous);
    previous.active = false;
    previous.previewUrl = null;
    previous.initialized = false;
    previous.progress = "idle";
    emit(previous);
    await teardownWebContainer();
    activeConversationId = null;
  }

  const wc = await getWebContainer();
  if (activeConversationId !== conversationId) {
    activeConversationId = conversationId;

    wc.on("server-ready", (_port, url) => {
      if (activeConversationId !== conversationId) return;
      clearServerReadyTimer(state);
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
      appendOutput(
        state,
        `\n${title}: ${message.message || "Unknown error"}${message.stack ? `\n${message.stack}` : ""}\n`,
      );
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

async function ensureDependencies(conversationId: string, state: RuntimeState) {
  const packageJson = packageJsonContent(state);
  if (!packageJson) return;

  const wc = await ensureContainer(conversationId, state);
  const nodeModules = await directoryExists(wc, "node_modules");
  if (nodeModules && state.installedPackageJson === packageJson) return;

  state.progress = "installing";
  state.error = null;
  appendOutput(
    state,
    nodeModules
      ? "\npackage.json changed; updating dependencies...\n"
      : "\nInstalling dependencies in WebContainer...\n",
  );
  emit(state);

  const exitCode = await runCommand(
    wc,
    "npm install --no-audit --no-fund",
    (data) => {
      appendOutput(state, data);
      emit(state);
    },
  );
  if (exitCode !== 0) {
    throw new Error(`npm install exited with code ${exitCode}`);
  }
  state.installedPackageJson = packageJson;
}

async function startDevServer(
  conversationId: string,
  state: RuntimeState,
  command: string,
) {
  const wc = await ensureContainer(conversationId, state);
  stopDevProcess(state);
  state.startCommand = command.trim();
  state.previewUrl = null;
  state.progress = "starting";
  state.error = null;
  appendOutput(state, `\n$ ${state.startCommand}\n`);
  emit(state);

  const process = await wc.spawn("jsh", ["-c", state.startCommand]);
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
        "The WebContainer dev server did not expose a preview URL. Check the terminal output and the project's dev script.",
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
  return action.type === "shell" && /(^|\s)npm\s+(install|i)(\s|$)/.test(action.content.trim());
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

async function executeWebContainerAction(
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
    state.progress = state.previewUrl ? "ready" : "writing";
    state.error = null;
    appendOutput(state, `Wrote ${safeAction.filePath}\n`);
    emit(state);
    return;
  }

  if (action.type === "shell") {
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
      const validation = await callGuard({ operation: "project", conversationId });
      if (validation.output) appendOutput(state, validation.output);
      await applyRepairedFiles(conversationId, state, validation.repairedFiles);
    }
    state.error = null;
    emit(state);
    return;
  }

  await ensureDependencies(conversationId, state);
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
    if (startCommand) await startDevServer(conversationId, state, startCommand);
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
      .then(() => executeWebContainerAction(conversationId, state, action))
      .catch((error) => setError(state, error));
  }

  return true;
}

export async function prebootStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  if (state.initialized) return;
  state.initialized = true;
  state.error = null;

  // Prebooting only warms the singleton WebContainer. It is not a file write
  // and should never put a reloaded chat into a "Writing files" state.
  if (!state.active) state.progress = "idle";
  emit(state);

  try {
    await ensureContainer(conversationId, state);
    appendOutput(state, "WebContainer ready.\n");
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
  if ((state.files && Object.keys(state.files).length > 0) || actions.length === 0) return;

  state.active = true;
  state.progress = "restoring";
  state.error = null;
  appendOutput(state, "Restoring project in WebContainer...\n");
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

    await syncSupabaseRuntime(conversationId).catch(() => false);

    if (safeNonSupabase.some(isInstallAction) || packageJsonContent(state)) {
      await ensureDependencies(conversationId, state);
    }

    const validation = await callGuard({ operation: "project", conversationId });
    if (validation.output) appendOutput(state, validation.output);
    await applyRepairedFiles(conversationId, state, validation.repairedFiles);

    const startActions = safeNonSupabase.filter((action) => action.type === "start");
    const explicitStart = startActions.length
      ? startActions[startActions.length - 1].content
      : null;
    const startCommand = explicitStart || detectStartCommand(state);
    if (startCommand) {
      await startDevServer(conversationId, state, startCommand);
    } else {
      state.progress = "idle";
      appendOutput(state, "No dev/start script found; project files are available in the editor.\n");
      emit(state);
    }
  } catch (error) {
    state.active = false;
    setError(state, error);
  }
}

export async function restartStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  state.active = true;
  state.progress = "starting";
  state.error = null;
  appendOutput(state, "\nRestarting WebContainer preview server...\n");
  emit(state);

  try {
    await ensureContainer(conversationId, state);
    await syncSupabaseRuntime(conversationId).catch(() => false);
    const validation = await callGuard({ operation: "project", conversationId });
    if (validation.output) appendOutput(state, validation.output);
    await applyRepairedFiles(conversationId, state, validation.repairedFiles);
    await ensureDependencies(conversationId, state);

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
    "--- WebContainer diagnostics ---",
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
  const wc = await ensureContainer(conversationId, state);
  await syncSupabaseRuntime(conversationId).catch(() => false);
  const validation = await callGuard({ operation: "project", conversationId });
  if (validation.output) appendOutput(state, validation.output);
  await applyRepairedFiles(conversationId, state, validation.repairedFiles);
  await ensureDependencies(conversationId, state);

  const packageJson = packageJsonContent(state);
  if (!packageJson) throw new Error("Project has no package.json to build");
  try {
    const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    if (!pkg.scripts?.build) throw new Error("Project has no npm build script");
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Project package.json is invalid");
    throw error;
  }

  appendOutput(state, "\n$ npm run build (WebContainer)\n");
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
  if (files.length === 0) throw new Error("WebContainer build produced no publishable files");
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
