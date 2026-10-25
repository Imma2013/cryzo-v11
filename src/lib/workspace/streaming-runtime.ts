import type { ArtifactAction, FileMap } from "./types";
import { terminalTranscript } from "./terminal-transcript";
import { missingReactViteScaffold, projectReadinessIssues } from "./project-scaffold";
import { expoStarterFiles, isExpoProject, isViteOnlyMobileArtifact, reconcileExpoPackage } from "./expo-starter";
import { inferProjectPlatforms } from "@/lib/project-platform";
import { nativeTargetFromActions, shouldUseVivari } from "./native-target";
import { canReuseLivePreview } from "./preview-lifecycle";
import { analyzeProject } from "./project-integrity";
import type { ProgressStage } from "./action-runner";
import {
  collectDirectoryFiles,
  directoryExists,
  getSandbox,
  isSandboxInfrastructureError,
  rebootSandboxRuntime,
  runCommand,
  resetSandboxProject,
  writeFiles,
} from "./sandbox";
import { preparePhoneSession, releasePhoneSession } from "./expo-phone-session";
import { closeProjectTerminals } from "./terminal-session";
import { EXPO_COMMAND, EXPO_ENV, prepareVivariMetro } from "./expo-vivari";
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
  projectIntent: string | null;
  nativeTarget: boolean;
  serverReadyTimer: ReturnType<typeof setTimeout> | null;
};
const runtimes = new Map<string, RuntimeState>();
let sandboxAuthToken: string | null = null;
let activeConversationId: string | null = null;
let sourceWatcher: (()=>void) | null = null;
let sourceWatchTimer: ReturnType<typeof setTimeout> | null = null;

export function setStreamingRuntimeAuthToken(token: string | null) {
  sandboxAuthToken = token;
}
/** Conversation metadata is authoritative. Framework stays pinned through reloads/recovery. */
export function configureStreamingRuntimeTarget(conversationId: string, nativeTarget: boolean) {
  const state = getState(conversationId);
  if (nativeTarget && !state.nativeTarget) {
    state.nativeTarget = true;
    stopDevProcess(state);
    state.previewUrl = null;
    state.startCommand = null;
    state.verifiedBuild = null;
    state.error = null;
    emit(state);
  }
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
    projectIntent: null,
    nativeTarget: false,
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
  const conversationId = [...runtimes].find(([, value]) => value === state)?.[0];
  if (conversationId) terminalTranscript(conversationId).append(data);
}

function clearServerReadyTimer(state: RuntimeState) {
  if (state.serverReadyTimer) clearTimeout(state.serverReadyTimer);
  state.serverReadyTimer = null;
}
function setError(state: RuntimeState, error: unknown, requestRepair = false) {
  clearServerReadyTimer(state);
  const message = error instanceof Error ? error.message : String(error);
  state.error = message;
  state.progress = "error";
  appendOutput(state, `\nError: ${message}\n`);
  emit(state);
  // Restoration and explicit restarts must use the same bounded model repair
  // path as streamed actions. Infrastructure/auth failures need no code edits.
  if (requestRepair || /project preflight failed|generated (?:file|project) validation failed|generated dependency installation failed|generated project failed|typescript project check failed|does not export|cannot resolve local import|missing npm dependency|invalid json in|postcss|npm run build exited/i.test(message)) {
    const conversationId = [...runtimes].find(([, runtime]) => runtime === state)?.[0];
    if (conversationId && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("cryzo:project-repair-needed", {
        detail: { conversationId, message: message.slice(0, 6000) },
      }));
    }
  }
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
    closeProjectTerminals(activeConversationId);
    await releasePhoneSession(activeConversationId);
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
    activeConversationId = null;
  }
  const wc = await getSandbox();
  if (activeConversationId !== conversationId) {
    // Vivari may persist its directory across document reloads. Claim a clean
    // project before writing the authoritative snapshot so tsc cannot compile
    // orphaned files absent from preflight validation.
    sourceWatcher?.();sourceWatcher=null;if(sourceWatchTimer)clearTimeout(sourceWatchTimer);
    await resetSandboxProject(wc);
    activeConversationId = conversationId;
    sourceWatcher=wc.watchSource?.(path=>{
      const relative=path.replace(/^\/cryzo-project\//,"");
      if(relative.split("/").some(part=>/^(node_modules|\.git|\.cryzo-expo|\.expo|\.next|dist|build|coverage|\.cache)$/.test(part)))return;
      if(!/\.(?:[cm]?[jt]sx?|json|html|css|md|txt|ya?ml|toml|svg)$/.test(relative))return;
      if(sourceWatchTimer)clearTimeout(sourceWatchTimer);
      sourceWatchTimer=setTimeout(()=>{void state.queue.catch(()=>{}).then(()=>syncWorkspaceFiles(conversationId)).catch(()=>{});},600);
    });
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
      if (message?.type === "PREVIEW_LAYOUT_DIAGNOSTIC") {
        const diagnostic = String(message.message || "Mobile layout issue");
        appendOutput(state, `\nResponsive layout audit: ${diagnostic}\n`);
        emit(state);
        if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cryzo:project-repair-needed", {
          detail: { conversationId, message: diagnostic },
        }));
        return;
      }
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
      setError(state, detail, true);
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
  const actions: ArtifactAction[] = files.map((file) => ({
    type: "file",
    filePath: file.path,
    content: file.content,
  }));
  if (shouldUseVivari(state.nativeTarget, state.files)) {
    const wc = await ensureContainer(conversationId, state);
    await writeFiles(wc, actions);
  }
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
async function ensureExpoStarter(conversationId: string, state: RuntimeState) {
  if (!state.nativeTarget && !isExpoProject(state.files)) return;
  state.nativeTarget = true;
  const missing = expoStarterFiles().filter((file) => state.files[file.path]?.type !== "file");
  const actions: ArtifactAction[] = missing.map(({ path, content }) => ({ type: "file", filePath: path, content }));
  const previous = packageJsonContent(state);
  if (previous) {
    const content = reconcileExpoPackage(previous, previous);
    if (content !== previous) actions.push({ type: "file", filePath: "package.json", content });
  }
  const app = fileContent(state, "app.json");
  if (app) {
    const config = JSON.parse(app);
    if (config.expo?.sdkVersion && config.expo.sdkVersion !== "58.0.0") {
      delete config.expo.sdkVersion;
      actions.push({ type: "file", filePath: "app.json", content: JSON.stringify(config, null, 2) + "\n" });
    }
  }
  if (!actions.length) return;
  const wc = await ensureContainer(conversationId, state);
  await writeFiles(wc, actions);
  for (const action of actions) updateFileMap(state, action);
  state.installedPackageJson = null;
  appendOutput(state, `\nInitialized ${missing.length} verified Expo SDK 58 starter files (native Metro, no Vite).\n`);
  emit(state);
}
async function ensureProjectScaffold(conversationId: string, state: RuntimeState) {
  if (state.nativeTarget || isExpoProject(state.files)) { await ensureExpoStarter(conversationId, state); return; }
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
  if (packageJsonContent(state) && shouldUseVivari(state.nativeTarget, state.files)) {
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
  try {
    return await callGuard({ operation: "project", conversationId, projectFiles, command, projectIntent: state.projectIntent });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep authentication and transport errors separate from generated code.
    if (/unauthorized|authentication|failed to fetch|request failed with (?:401|403|5\d\d)/i.test(message)) throw error;
    throw new Error(`Generated project validation failed:\n${message}`);
  }
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
  if (state.nativeTarget || isExpoProject(state.files)) return; // Native apps never run Vite build.
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
  if (/^vite build(?:\s|$)/.test(build) &&
      !!(pkg as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> }).devDependencies?.typescript &&
      state.files["tsconfig.json"]?.type === "file") {
    const project = state.files["tsconfig.app.json"]?.type === "file" ? " -p tsconfig.app.json" : "";
    const command = `node_modules/.bin/tsc${project} --noEmit --noUnusedLocals false --noUnusedParameters false`;
    let details = "";
    const status = await runCommand(wc, command, (data) => {
      details = (details + data).slice(-6000);
      appendOutput(state, data);
      emit(state);
    });
    if (status !== 0) throw new Error(`TypeScript project check failed (${status}).\n${details.slice(-4000)}`);
  }
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
  const native = state.nativeTarget || isExpoProject(state.files);
  if (!native) {
    await ensureProjectIntegrity(conversationId, state);
    await ensurePythonDependencies(conversationId, state);
  }

  const packageJson = packageJsonContent(state);
  if (!packageJson) return;
  if (!native) await assertRunnableProject(conversationId, state);
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
  let installOutput = "";
  const exitCode = await runCommand(wc, installCommand, (data) => {
    installOutput = (installOutput + data).slice(-6000);
    appendOutput(state, data);
    emit(state);
  });
  if (exitCode !== 0) {
    throw new Error(`Generated dependency installation failed: ${installCommand.split(" --")[0]} exited with code ${exitCode}.\n${installOutput}`);
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
  if (state.nativeTarget && action.type === "file" && action.filePath) {
    const path = action.filePath.replace(/^\.\//, "");
    if (isViteOnlyMobileArtifact(path)) {
      appendOutput(state, `Skipped incompatible web/Vite file ${path} in native Expo app.\n`);
      emit(state);
      return;
    }
    if (path === "package.json") safeAction = { ...action, content: reconcileExpoPackage(action.content, fileContent(state, "package.json")) };
    else if (["app.json", "tsconfig.json", "index.ts"].includes(path)) {
      // Do not let generated syntax or config drift break the verified SDK foundation.
      appendOutput(state, `Preserved verified Expo starter config ${path}.\n`);
      emit(state);
      return;
    }
  }
  if (action.type === "file") {
    const validation = await callGuard({
      operation: "file",
      conversationId,
      action: safeAction,
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
  if (state.nativeTarget && action.type === "shell" && isInstallAction(action)) {
    await ensureDependencies(conversationId, state);
    return;
  }
  if (state.nativeTarget && action.type === "start") {
    await startNativeMetro(conversationId, state);
    return;
  }
  if (action.type === "shell") {
    if (isInstallAction(action)) {
      await ensureProjectScaffold(conversationId, state);
      if (!state.nativeTarget) await ensureProjectIntegrity(conversationId, state);
    }
    if (!state.nativeTarget) await assertRunnableProject(conversationId, state, action.content);
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
  const preflight = await validateCurrentProject(conversationId, state, action.content);
  if (preflight.output) appendOutput(state, preflight.output);
  await applyRepairedFiles(conversationId, state, preflight.repairedFiles);
  await verifyWebBuild(conversationId, state);
  await startDevServer(conversationId, state, action.content);
}
export function saveStreamingRuntimeFile(conversationId: string, filePath: string, content: string, expectedContent?: string) {
  const state=getState(conversationId);
  const expected=expectedContent ?? state.files[filePath]?.content;
  const task=state.queue.catch(()=>{}).then(()=>writeManualRuntimeFile(conversationId,filePath,content,expected));
  state.queue=task.then(()=>{},()=>{});
  return task;
}
async function writeManualRuntimeFile(
  conversationId: string,
  filePath: string,
  content: string,
  expectedContent: string | undefined,
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
  if (fileContent(state,filePath) !== (expectedContent ?? "")) throw new Error("This file changed while you were editing. Your draft has been kept.");
  if (state.nativeTarget) {
    if (["app.json", "tsconfig.json", "index.ts", "metro.config.js"].includes(safeAction.filePath) || isViteOnlyMobileArtifact(safeAction.filePath)) throw new Error("Native framework configuration is managed by Cryzo. Edit app screens instead.");
    if (safeAction.filePath === "package.json") safeAction.content = reconcileExpoPackage(safeAction.content, fileContent(state, "package.json"));
  }
  const wc = await ensureContainer(conversationId, state);
  const exists=await wc.fs.exists(safeAction.filePath);
  if ((!exists && expectedContent!==undefined) || (exists && await wc.fs.readTextFile(safeAction.filePath)!==(expectedContent ?? ""))) throw new Error("This file changed in the terminal. Your draft has been kept.");
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
  if (needsRestart && state.nativeTarget) {
    await startNativeMetro(conversationId, state, true);
  } else if (needsRestart) {
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
  userIntent?: string,
) {
  if (!text.includes("<cryzoArtifact")) return false;
  const state = getState(conversationId);
  if (userIntent?.trim() && !/automatic project repair|generated project failed|fix the underlying cause by inspecting/i.test(userIntent)) {
    state.projectIntent = userIntent.slice(0, 3000);
    if (!Object.keys(state.files).length) state.nativeTarget = !inferProjectPlatforms(userIntent).includes("web");
  }
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
        setError(state, error, !isSandboxInfrastructureError(error));
      });
  }

  return true;
}
export async function prebootStreamingRuntime(conversationId: string, nativeTarget = false) {
  const state = getState(conversationId);
  state.nativeTarget = state.nativeTarget || nativeTarget;
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
  nativeTarget = false,
) {
  const state = getState(conversationId);
  state.nativeTarget = nativeTarget || state.nativeTarget || nativeTargetFromActions(actions);
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
    state.nativeTarget = state.nativeTarget || nativeTargetFromActions(safeActions);
    const fileActions = safeNonSupabase.filter((action) => action.type === "file" &&
      (!state.nativeTarget || !isViteOnlyMobileArtifact(action.filePath || "")));
    state.files = fileMapFromActions(fileActions);
    emit(state);
    if (state.nativeTarget) {
      await ensureExpoStarter(conversationId, state);
      const wc = await ensureContainer(conversationId, state);
      await writeFiles(wc, Object.entries(state.files).filter(([,entry]) => entry.type === "file").map(([filePath,entry]) => ({ type: "file" as const, filePath, content: entry.content || "" })));
      appendOutput(state, `Restored ${fileActions.length} native app files in Vivari.\n`);
      const migrated = ["package.json", "app.json"].flatMap(path => {
        const content = state.files[path]?.content;
        const original = [...safeNonSupabase].reverse().find(a => a.type === "file" && a.filePath === path)?.content;
        return content && content !== original ? [{path, content}] : [];
      });
      if (migrated.length && typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cryzo:workspace-files-changed", {detail: {conversationId, files: migrated}}));
      await startNativeMetro(conversationId, state);
      return;
    }
    const wc = await ensureContainer(conversationId, state);
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
const recoveringConversations = new Set<string>();
/** Return from Safari background: revive the dev process, or restore persisted files. */
export async function recoverStreamingRuntime(conversationId: string, savedActions: ArtifactAction[], forceTransportRecovery = false, nativeTarget = false) {
  if (recoveringConversations.has(conversationId)) return;
  const state = getState(conversationId);
  if (nativeTarget || state.nativeTarget || nativeTargetFromActions(savedActions)) {
    state.nativeTarget = true;
    if (!Object.keys(state.files).length) await restoreStreamingRuntime(conversationId, savedActions, true);
    if (state.progress === "error" || state.progress === "installing" || state.progress === "writing") return;
    if (!state.devProcess || forceTransportRecovery) await ensureNativePreview(conversationId, true);
    return;
  }
  // A failed compile is not fixed by tab focus or repeated browser-worker restarts.
  if (state.progress === "error") return;
  if (state.progress === "writing" || state.progress === "installing") return;
  recoveringConversations.add(conversationId);
  try {
    if (!Object.keys(state.files).length) {
      if (savedActions.length) await restoreStreamingRuntime(conversationId, savedActions, state.nativeTarget);
      return;
    }
    if (!state.previewUrl) return;
    appendOutput(state, "\nChecking browser preview after Safari resumed...\n");
    try {
      // A stale Vivari filesystem can hang after iOS suspends a background tab.
      const wc = await Promise.race([
        getSandbox(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Vivari did not respond after Safari resumed")), 7000)),
      ]);
      const hasManifest = await Promise.race([
        wc.fs.exists("package.json"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Vivari filesystem did not respond")), 7000)),
      ]);
      if (!hasManifest && state.files["package.json"]?.type === "file") throw new Error("Vivari project storage was lost");
      // Bolt-style stable preview: a responsive filesystem and an existing
      // running dev-server process are NOT grounds for a restart. Keep the
      // iframe URL, JavaScript state, scroll position, and HMR connection.
      if (forceTransportRecovery) throw new Error("Preview Service Worker transport failed");
      if (canReuseLivePreview({
        previewUrl: state.previewUrl,
        hasProcess: !!state.devProcess,
        filesystemHealthy: !!hasManifest || state.files["package.json"]?.type !== "file",
      })) return;
      // Only a missing server (or a genuinely lost preview URL) needs a new
      // process. The process was not restarted merely because Safari focused.
      await restartStreamingRuntime(conversationId);
    } catch (error) {
      appendOutput(state, `\nPreview transport failed; restoring saved project: ${String(error)}\n`);
      stopDevProcess(state);
      await rebootSandboxRuntime();
      activeConversationId = null;
      state.active = false;
      state.initialized = false;
      state.previewUrl = null;
      state.files = {};
      state.installedPackageJson = null;
      state.verifiedBuild = null;
      state.processedActionsByMessage.clear();
      state.progress = "restoring";
      emit(state);
      if (savedActions.length) await restoreStreamingRuntime(conversationId, savedActions, state.nativeTarget);
      else throw new Error("No saved project files are available for preview restoration");
    }
  } finally { recoveringConversations.delete(conversationId); }
}
export async function restartStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  await state.queue;
  if (state.nativeTarget || isExpoProject(state.files)) {
    await ensureNativePreview(conversationId, true);
    return;
  }
  state.active = true;
  state.progress = "starting";
  state.error = null;
  state.previewUrl = null;
  appendOutput(state, "\nRestoring browser preview…\n");
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
    state.nativeTarget ? "--- Expo Metro diagnostics (Vivari) ---" : "--- Cryzo runtime diagnostics (Vivari) ---",
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
  if (state.nativeTarget || isExpoProject(state.files))
    throw new Error("Native Expo apps are built by Expo/EAS, not the web Vite build. Open Device Preview or Mobile Publish.");
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
/** Shared ownership entry point for editor, shell, Metro and phone forwarding. */
export async function getWorkspaceContainer(conversationId: string) { return ensureContainer(conversationId, getState(conversationId)); }
export function appendWorkspaceOutput(conversationId: string, chunk: string) { const state = getState(conversationId); appendOutput(state, chunk); emit(state); }
async function startNativeMetro(conversationId: string, state: RuntimeState, force = false) {
  if (state.devProcess && state.startCommand === EXPO_COMMAND && !force) return;
  state.nativeTarget = true;
  await ensureDependencies(conversationId, state);
  const wc = await ensureContainer(conversationId, state);
  await prepareVivariMetro(wc);
  stopDevProcess(state);
  state.active = true; state.startCommand = EXPO_COMMAND; state.progress = "starting"; state.previewUrl = null; state.error = null;
  appendOutput(state, "\n$ " + EXPO_COMMAND + "\n"); emit(state);
  const publicOrigin=await preparePhoneSession(conversationId,wc,await waitForSandboxAuthToken(),chunk=>{appendOutput(state,chunk);emit(state);},force);
  const env={...EXPO_ENV,...(publicOrigin?{EXPO_PACKAGER_PROXY_URL:publicOrigin}:{})};
  const proc = await wc.spawnShell(EXPO_COMMAND, {env}); state.devProcess = proc;
  void proc.output.pipeTo(new WritableStream<string>({write(chunk) { if (state.devProcess === proc) { appendOutput(state,chunk); emit(state); } }})).catch(() => {});
  state.serverReadyTimer = setTimeout(() => { if (state.devProcess === proc && !state.previewUrl) setError(state,"Metro has not opened port 8081. Inspect the runtime output, then retry."); },120_000);
  void proc.exit.then(code => { if (state.devProcess !== proc) return; state.devProcess = null; clearServerReadyTimer(state); setError(state, `Metro exited with code ${code}. Reconnect to restart it.`); });
}
const nativeStarts = new Map<string, Promise<void>>();
export async function ensureNativePreview(conversationId: string, force = false) {
  const pending = nativeStarts.get(conversationId); if (pending) return pending;
  const state = getState(conversationId);
  const task = state.queue.catch(() => {}).then(() => startNativeMetro(conversationId,state,force));
  state.queue = task; nativeStarts.set(conversationId, task);
  try { await task; } catch(error) { setError(state,error); throw error; }
  finally { if (nativeStarts.get(conversationId) === task) nativeStarts.delete(conversationId); }
}
/** Capture only bounded, editable source; dependency/cache trees and binaries stay out of Convex. */
export async function syncWorkspaceFiles(conversationId: string) {
  if (activeConversationId !== conversationId) return;
  const state = getState(conversationId);
  const runtime = await getSandbox();
  const changes: {path: string; content: string}[] = [];
  let visited = 0, bytes = 0;
  async function walk(dir: string) {
    for (const entry of await runtime.fs.readdir(dir)) {
      if (++visited > 1500) return;
      if (/^(node_modules|\.git|\.cryzo-expo|\.expo|\.next|dist|build|coverage|\.cache)$/.test(entry.name)) continue;
      const path = (dir === "." ? "" : dir + "/") + entry.name;
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?|json|html|css|md|txt|ya?ml|toml|svg)$/.test(path)) continue;
      const content = await runtime.fs.readTextFile(path);
      bytes += content.length; if (content.length > 250_000 || bytes > 2_000_000 || content.includes("\0")) continue;
      if (state.files[path]?.content !== content) changes.push({path,content});
    }
  }
  await walk(".");
  if (activeConversationId !== conversationId || !changes.length) return;
  for (const file of changes) updateFileMap(state,{type:"file",filePath:file.path,content:file.content});
  emit(state);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("cryzo:workspace-files-changed",{detail:{conversationId,files:changes}}));
}
