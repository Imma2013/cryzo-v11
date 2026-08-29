import type { WebContainer } from "@webcontainer/api";
import type { ArtifactAction, FileMap } from "./types";
import type { ProgressStage } from "./action-runner";
import { getWebContainer, runCommand, writeFiles } from "./webcontainer";

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
  fileQueue: Promise<void>;
  installPromise: Promise<number> | null;
  installPackageJson: string | null;
  installedPackageJson: string | null;
  startPromise: Promise<void> | null;
  serverListenerAttached: boolean;
};

const runtimes = new Map<string, RuntimeState>();

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
    fileQueue: Promise.resolve(),
    installPromise: null,
    installPackageJson: null,
    installedPackageJson: null,
    startPromise: null,
    serverListenerAttached: false,
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
  state.terminalOutput += data;
  emit(state);
}

function setProgress(state: RuntimeState, progress: ProgressStage) {
  state.progress = progress;
  emit(state);
}

function setError(state: RuntimeState, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  state.error = message;
  state.progress = "error";
  appendOutput(state, `\r\nError: ${message}\r\n`);
}

async function attachServerListener(
  state: RuntimeState,
  wc: WebContainer,
) {
  if (state.serverListenerAttached) return;
  state.serverListenerAttached = true;
  wc.on("server-ready", (_port, url) => {
    state.previewUrl = url;
    state.progress = "ready";
    emit(state);
  });
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

function updateFileMap(state: RuntimeState, action: ArtifactAction) {
  if (action.type !== "file" || !action.filePath) return;
  state.files[action.filePath] = { type: "file", content: action.content };
  const parts = action.filePath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const dir = parts.slice(0, i).join("/");
    if (!state.files[dir]) state.files[dir] = { type: "folder" };
  }
}

async function startInstall(
  conversationId: string,
  state: RuntimeState,
  packageJson: string,
) {
  if (state.installPromise && state.installPackageJson === packageJson) {
    return state.installPromise;
  }
  if (state.installedPackageJson === packageJson) return 0;

  const wc = await getWebContainer();
  await attachServerListener(state, wc);

  if (state.installPromise) {
    await state.installPromise.catch(() => -1);
    if (state.installedPackageJson === packageJson) return 0;
  }

  state.installPackageJson = packageJson;
  setProgress(state, "installing");
  appendOutput(state, "$ npm install --no-audit --no-fund --prefer-offline\r\n");

  const promise = runCommand(
    wc,
    "npm install --no-audit --no-fund --prefer-offline",
    (data) => appendOutput(state, data),
  )
    .then((code) => {
      if (code === 0) {
        state.installedPackageJson = packageJson;
        appendOutput(state, "\r\nDependencies ready.\r\n");
      } else {
        throw new Error(`npm install exited with code ${code}`);
      }
      return code;
    })
    .catch((error) => {
      setError(state, error);
      return -1;
    })
    .finally(() => {
      if (state.installPromise === promise) {
        state.installPromise = null;
        state.installPackageJson = null;
      }
    });

  state.installPromise = promise;
  return promise;
}

async function handleFileAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  const wc = await getWebContainer();
  await attachServerListener(state, wc);
  await writeFiles(wc, [action]);
  updateFileMap(state, action);
  appendOutput(state, `Wrote ${action.filePath}\r\n`);

  if (action.filePath === "package.json") {
    // package.json is generated first. Start dependency installation immediately
    // so npm runs in parallel with the model streaming the rest of the site.
    void startInstall(conversationId, state, action.content);
  }
}

async function handleShellAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  const normalized = action.content.trim();
  const isInstall = /(^|\s)npm\s+(install|i)(\s|$)/.test(normalized);

  if (isInstall) {
    await state.fileQueue;
    const packageJsonEntry = state.files["package.json"];
    const packageJson =
      packageJsonEntry?.type === "file" ? packageJsonEntry.content : null;
    if (packageJson) await startInstall(conversationId, state, packageJson);
    return;
  }

  const wc = await getWebContainer();
  await state.fileQueue;
  appendOutput(state, `$ ${normalized}\r\n`);
  const code = await runCommand(wc, normalized, (data) => appendOutput(state, data));
  if (code !== 0) throw new Error(`${normalized} exited with code ${code}`);
}

async function handleStartAction(
  state: RuntimeState,
  action: ArtifactAction,
) {
  if (state.startPromise) return state.startPromise;

  state.startPromise = (async () => {
    const wc = await getWebContainer();
    await attachServerListener(state, wc);
    await state.fileQueue;
    if (state.installPromise) {
      const code = await state.installPromise;
      if (code !== 0) throw new Error("Dependencies failed to install");
    }

    setProgress(state, "starting");
    const command = action.content.trim();
    appendOutput(state, `$ ${command}\r\n`);
    const parts = command.split(/\s+/);
    const cmd = parts.shift();
    if (!cmd) throw new Error("Missing start command");

    const process = await wc.spawn(cmd, parts);
    void process.output.pipeTo(
      new WritableStream({
        write(data) {
          appendOutput(state, data);
        },
      }),
    );
  })().catch((error) => {
    state.startPromise = null;
    setError(state, error);
  });

  return state.startPromise;
}

async function executeAction(
  conversationId: string,
  state: RuntimeState,
  action: ArtifactAction,
) {
  try {
    if (action.type === "file") {
      state.fileQueue = state.fileQueue.then(() =>
        handleFileAction(conversationId, state, action),
      );
      await state.fileQueue;
      return;
    }

    if (action.type === "shell") {
      await handleShellAction(conversationId, state, action);
      return;
    }

    if (action.type === "start") {
      await handleStartAction(state, action);
    }
  } catch (error) {
    setError(state, error);
  }
}

export function processStreamingArtifactText(
  conversationId: string,
  messageId: string,
  text: string,
) {
  if (!text.includes("<cryzoArtifact")) return false;

  const state = getState(conversationId);
  state.active = true;
  if (!state.previewUrl && state.progress === "ready") state.progress = "writing";
  emit(state);

  const actions = parseCompletedActions(text);
  const processed = state.processedActionsByMessage.get(messageId) ?? 0;
  if (actions.length <= processed) return true;

  const newActions = actions.slice(processed);
  state.processedActionsByMessage.set(messageId, actions.length);

  for (const action of newActions) {
    void executeAction(conversationId, state, action);
  }

  return true;
}

export function subscribeStreamingRuntime(
  conversationId: string,
  listener: Listener,
) {
  const state = getState(conversationId);
  state.listeners.add(listener);
  listener(snapshot(state));
  return () => state.listeners.delete(listener);
}

export function getStreamingRuntimeSnapshot(conversationId: string) {
  return snapshot(getState(conversationId));
}

export function isStreamingRuntimeActive(conversationId: string) {
  return getState(conversationId).active;
}

export async function prebootStreamingRuntime() {
  await getWebContainer();
}
