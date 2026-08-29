import type { ArtifactAction, FileMap } from "./types";
import type { ProgressStage } from "./action-runner";

export interface StreamingRuntimeSnapshot {
  active: boolean;
  files: FileMap;
  previewUrl: string | null;
  terminalOutput: string;
  progress: ProgressStage;
  error: string | null;
}

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
  return { type, filePath };
}

function parseCompletedActions(text: string): ArtifactAction[] {
  if (!text.includes("<cryzoArtifact")) return [];

  const actions: ArtifactAction[] = [];
  const pattern = /<cryzoAction([^>]*)>([\s\S]*?)<\/cryzoAction>/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const { type, filePath } = parseActionAttributes(match[1]);
    if (!type) continue;
    actions.push({ type, filePath, content: match[2] });
  }

  return actions;
}

type SandboxResponse = {
  sandboxName?: string;
  previewUrl?: string | null;
  progress?: ProgressStage;
  output?: string;
  error?: string;
};

async function callSandbox(body: Record<string, unknown>): Promise<SandboxResponse> {
  if (!sandboxAuthToken) {
    throw new Error("Authentication is still loading. Please retry.");
  }

  const response = await fetch("/api/sandbox/runtime", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sandboxAuthToken}`,
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as SandboxResponse;
  if (!response.ok) {
    throw new Error(data.error || `Sandbox request failed with ${response.status}`);
  }
  return data;
}

function applyResponse(state: RuntimeState, response: SandboxResponse) {
  if (response.output) appendOutput(state, response.output);
  if (response.previewUrl) state.previewUrl = response.previewUrl;
  if (response.progress) state.progress = response.progress;
  state.error = null;
  emit(state);
}

async function executeRemoteAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  if (action.type === "file") {
    updateFileMap(state, action);
    state.progress = "writing";
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
    action,
  });
  applyResponse(state, response);
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
  state.files = fileMapFromActions(actions);
  state.progress = "writing";
  state.error = null;
  appendOutput(state, "Restoring project in Vercel Sandbox...\n");
  emit(state);

  try {
    const response = await callSandbox({
      operation: "restore",
      conversationId,
      actions,
    });
    applyResponse(state, response);
  } catch (error) {
    setError(state, error);
  }
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
