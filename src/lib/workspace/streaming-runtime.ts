import type { ArtifactAction, FileMap } from "./types";
import type { ProgressStage } from "./action-runner";
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

type RuntimeState = StreamingRuntimeSnapshot & {
  listeners: Set<Listener>;
  processedActionsByMessage: Map<string, number>;
  queue: Promise<void>;
  initialized: boolean;
};

const runtimes = new Map<string, RuntimeState>();
let sandboxAuthToken: string | null = null;

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
    progress: "writing",
    error: null,
    listeners: new Set(),
    processedActionsByMessage: new Map(),
    queue: Promise.resolve(),
    initialized: false,
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

function setError(state: RuntimeState, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  state.error = message;
  state.progress = "error";
  appendOutput(state, `\nError: ${message}\n`);
  emit(state);
}

function updateFileMap(state: RuntimeState, action: ArtifactAction) {
  if (action.type !== "file" || !action.filePath) return;
  state.files[action.filePath] = { type: "file", content: action.content };
  const parts = action.filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (!state.files[dir]) state.files[dir] = { type: "folder" };
  }
}

function applyRepairedFiles(state: RuntimeState, files?: SandboxBuildFile[]) {
  if (!files?.length) return false;
  for (const file of files) {
    updateFileMap(state, {
      type: "file",
      filePath: file.path,
      content: file.content,
    });
  }
  return true;
}

function fileMapFromActions(actions: ArtifactAction[]) {
  const files: FileMap = {};
  for (const action of actions) {
    if (action.type !== "file" || !action.filePath) continue;
    files[action.filePath] = { type: "file", content: action.content };
    const parts = action.filePath.split("/");
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

type SandboxResponse = {
  sandboxName?: string;
  previewUrl?: string | null;
  progress?: ProgressStage;
  output?: string;
  files?: SandboxBuildFile[];
  error?: string;
};

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

async function callSandbox(body: Record<string, unknown>): Promise<SandboxResponse> {
  return await authenticatedPost<SandboxResponse>("/api/sandbox/runtime", body);
}

async function callGuard(body: Record<string, unknown>): Promise<GuardResponse> {
  return await authenticatedPost<GuardResponse>("/api/sandbox/validate", body);
}

function applyResponse(state: RuntimeState, response: SandboxResponse) {
  if (response.output) appendOutput(state, response.output);
  if (response.previewUrl) state.previewUrl = response.previewUrl;
  if (response.progress) {
    const keepReadyDuringHmr = state.previewUrl && response.progress === "writing";
    state.progress = keepReadyDuringHmr ? "ready" : response.progress;
  }
  state.error = null;
  emit(state);
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
    throw new Error("This project requested a Supabase action, but no Supabase project is selected in Developer Connections.");
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

async function executeRemoteAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  if (action.type === "supabase") {
    await executeSupabaseAction(conversationId, state, action);
    return;
  }

  let safeAction = action;

  if (action.type === "file") {
    const validation = await callGuard({
      operation: "file",
      conversationId,
      action,
    });
    if (!validation.action) {
      throw new Error(`Generated file validation returned no action for ${action.filePath || "unknown file"}`);
    }
    safeAction = validation.action;
    if (validation.output) appendOutput(state, validation.output);

    updateFileMap(state, safeAction);
    state.progress = state.previewUrl ? "ready" : "writing";
    emit(state);
  } else if (action.type === "shell") {
    state.progress = "installing";
    emit(state);
  } else {
    state.progress = "starting";
    emit(state);
  }

  const response = await callSandbox({
    operation: "action",
    conversationId,
    action: safeAction,
  });
  applyResponse(state, response);

  if (isInstallAction(safeAction)) {
    const validation = await callGuard({
      operation: "project",
      conversationId,
    });
    if (validation.output) appendOutput(state, validation.output);
    if (applyRepairedFiles(state, validation.repairedFiles)) emit(state);
  }
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
  if (validation.output) appendOutput(state, validation.output);
  updateFileMap(state, safeAction);
  state.progress = state.previewUrl ? "ready" : "writing";
  emit(state);

  const response = await callSandbox({
    operation: "action",
    conversationId,
    action: safeAction,
  });
  applyResponse(state, response);

  const needsInstall = /(^|\/)package\.json$/i.test(safeAction.filePath);
  const needsRestart = needsInstall || /(^|\/)(vite\.config\.(ts|js|mts|mjs|cts|cjs)|index\.html)$/i.test(safeAction.filePath);

  if (needsInstall) {
    state.progress = "installing";
    emit(state);
    const install = await callSandbox({
      operation: "action",
      conversationId,
      action: { type: "shell", content: "npm install" },
    });
    applyResponse(state, install);
  }

  if (needsRestart) {
    state.progress = "starting";
    emit(state);
    const restarted = await callSandbox({ operation: "restart", conversationId });
    applyResponse(state, restarted);
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
  if (!state.active) {
    state.active = true;
    state.progress = "writing";
    state.error = null;
    emit(state);
  }

  const actions = parseCompletedActions(text);
  const processed = state.processedActionsByMessage.get(messageId) ?? 0;
  if (actions.length <= processed) return true;

  const newActions = actions.slice(processed);
  state.processedActionsByMessage.set(messageId, actions.length);

  for (const action of newActions) {
    state.queue = state.queue
      .then(() => executeRemoteAction(conversationId, state, action))
      .catch((error) => setError(state, error));
  }

  return true;
}

export async function prebootStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  if (state.initialized) return;
  state.initialized = true;

  try {
    const response = await callSandbox({
      operation: "init",
      conversationId,
    });
    if (response.previewUrl) {
      state.active = true;
      applyResponse(state, response);
    }
    await syncSupabaseRuntime(conversationId).catch(() => false);
  } catch (error) {
    state.initialized = false;
    throw error;
  }
}

export async function restoreStreamingRuntime(
  conversationId: string,
  actions: ArtifactAction[],
) {
  const state = getState(conversationId);
  if (state.active || actions.length === 0) return;

  state.active = true;
  state.progress = "writing";
  state.error = null;
  appendOutput(state, "Restoring project in Vercel Sandbox...\n");
  emit(state);

  try {
    const guarded = await callGuard({
      operation: "actions",
      conversationId,
      actions: actions.filter((action) => action.type !== "supabase"),
    });
    const safeNonSupabase = guarded.actions || actions.filter((action) => action.type !== "supabase");
    const safeActions = [
      ...safeNonSupabase,
      ...actions.filter((action) => action.type === "supabase"),
    ];
    if (guarded.output) appendOutput(state, guarded.output);
    state.files = fileMapFromActions(safeActions);
    emit(state);

    await syncSupabaseRuntime(conversationId).catch(() => false);

    const response = await callSandbox({
      operation: "restore",
      conversationId,
      actions: safeNonSupabase,
    });
    applyResponse(state, response);

    const validation = await callGuard({
      operation: "project",
      conversationId,
    });
    if (validation.output) appendOutput(state, validation.output);
    if (applyRepairedFiles(state, validation.repairedFiles)) emit(state);
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
  appendOutput(state, "\nRestarting preview server...\n");
  emit(state);

  try {
    await syncSupabaseRuntime(conversationId).catch(() => false);
    const validation = await callGuard({
      operation: "project",
      conversationId,
    });
    if (validation.output) appendOutput(state, validation.output);
    if (applyRepairedFiles(state, validation.repairedFiles)) emit(state);

    const response = await callSandbox({
      operation: "restart",
      conversationId,
    });
    applyResponse(state, response);
  } catch (error) {
    setError(state, error);
    throw error;
  }
}

export async function refreshStreamingRuntimeLogs(conversationId: string) {
  const state = getState(conversationId);
  const response = await callSandbox({
    operation: "logs",
    conversationId,
  });
  if (response.output) {
    appendOutput(state, `\n--- Preview diagnostics ---\n${response.output}\n`);
    emit(state);
  }
  return response.output || "";
}

export async function buildStreamingRuntime(conversationId: string) {
  const state = getState(conversationId);
  await syncSupabaseRuntime(conversationId).catch(() => false);
  const validation = await callGuard({
    operation: "project",
    conversationId,
  });
  if (validation.output) appendOutput(state, validation.output);
  if (applyRepairedFiles(state, validation.repairedFiles)) emit(state);

  const response = await callSandbox({
    operation: "build",
    conversationId,
  });
  if (response.output) {
    appendOutput(state, `\n${response.output}\n`);
    emit(state);
  }
  if (!response.files || response.files.length === 0) {
    throw new Error("Sandbox build produced no publishable files");
  }
  return {
    files: response.files,
    output: response.output || "",
  };
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
  return getState(conversationId).active;
}
