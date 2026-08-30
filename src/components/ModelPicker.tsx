"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Laptop,
  Loader2,
  Search,
  Server,
  Settings2,
  X,
} from "lucide-react";
import {
  DEFAULT_MODEL_SELECTION,
  PROVIDERS,
  displayModelName,
  getProvider,
  readRuntimeProviderBaseURL,
  readRuntimeProviderKey,
  storeDeviceProviderBaseURL,
  storeDeviceProviderKey,
  storeSessionProviderBaseURL,
  storeSessionProviderKey,
  type CredentialMode,
  type ModelSelection,
  type ProviderDefinition,
} from "@/lib/ai/models";

export type CatalogModel = {
  id: string;
  name: string;
  reasoning?: boolean;
  toolCall?: boolean;
  attachments?: boolean;
  context?: number | null;
  output?: number | null;
  lastUpdated?: string | null;
};

type CatalogResponse = {
  providers?: Record<string, { models?: CatalogModel[] }>;
};

type AccountConnection = {
  providerId: string;
  baseUrl?: string;
};

type PickerTab = "models" | "providers";
type Feedback = {
  type: "idle" | "saving" | "saved" | "success" | "error";
  message?: string;
};

const PROVIDER_CONSOLES: Record<string, string> = {
  openrouter: "https://openrouter.ai/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  google: "https://aistudio.google.com/app/apikey",
  xai: "https://console.x.ai/",
  groq: "https://console.groq.com/keys",
  deepseek: "https://platform.deepseek.com/api_keys",
  mistral: "https://console.mistral.ai/api-keys/",
  together: "https://api.together.ai/settings/api-keys",
  cerebras: "https://cloud.cerebras.ai/",
  nvidia: "https://build.nvidia.com/",
  moonshotai: "https://platform.moonshot.ai/console/api-keys",
};

const PROVIDER_MARKS: Record<string, string> = {
  cryzo: "C",
  openrouter: "OR",
  openai: "OA",
  anthropic: "A",
  google: "G",
  xai: "x",
  groq: "GQ",
  deepseek: "DS",
  mistral: "M",
  together: "T",
  cerebras: "CE",
  nvidia: "NV",
  moonshotai: "K",
  custom: "<>\u200b",
  ollama: "O",
  lmstudio: "LM",
};

function ProviderMark({ provider }: { provider: ProviderDefinition }) {
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-[10px] font-semibold tracking-tight text-zinc-200">
      {PROVIDER_MARKS[provider.id] || provider.name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function ModelPicker({
  selection,
  onChange,
  compact = false,
}: {
  selection: ModelSelection;
  onChange: (selection: ModelSelection) => void;
  compact?: boolean;
}) {
  const authToken = useAuthToken();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>("models");
  const [providerId, setProviderId] = useState(selection.providerId || "cryzo");
  const [modelId, setModelId] = useState(
    selection.modelId || DEFAULT_MODEL_SELECTION.modelId,
  );
  const [credentialMode, setCredentialMode] = useState<CredentialMode>(
    selection.credentialMode || "cryzo",
  );
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(selection.baseURL || "");
  const [persistDevice, setPersistDevice] = useState(true);
  const [savedDevice, setSavedDevice] = useState(false);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [accountConnections, setAccountConnections] = useState<AccountConnection[]>([]);
  const [feedback, setFeedback] = useState<Feedback>({ type: "idle" });
  const [busy, setBusy] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);

  const provider = getProvider(providerId);
  const accountSaved = accountConnections.some(
    (item) => item.providerId === providerId,
  );
  const providerConsole = PROVIDER_CONSOLES[providerId];

  useEffect(() => {
    const handler = () => {
      setTab("models");
      setOpen(true);
    };
    window.addEventListener("cryzo:open-model-picker", handler);
    return () => window.removeEventListener("cryzo:open-model-picker", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setProviderId(selection.providerId || "cryzo");
    setModelId(selection.modelId || DEFAULT_MODEL_SELECTION.modelId);
    setCredentialMode(selection.credentialMode || "cryzo");
    setSearch("");
    setFeedback({ type: "idle" });
  }, [open, selection]);

  useEffect(() => {
    const nextProvider = getProvider(providerId);
    const storedBase = readRuntimeProviderBaseURL(providerId);
    const storedKey = readRuntimeProviderKey(providerId);
    setApiKey(storedKey);
    setSavedDevice(Boolean(storedKey));
    setBaseURL(
      storedBase ||
        (selection.providerId === providerId ? selection.baseURL : "") ||
        nextProvider.defaultBaseURL ||
        "",
    );
    setDiscoveredModels([]);
    setFeedback({ type: "idle" });

    if (nextProvider.id === "cryzo") {
      setCredentialMode("cryzo");
      setModelId(DEFAULT_MODEL_SELECTION.modelId);
    } else if (nextProvider.local) {
      setCredentialMode("device");
    } else if (selection.providerId !== providerId) {
      const alreadyAccountSaved = accountConnections.some(
        (connection) => connection.providerId === providerId,
      );
      setCredentialMode(alreadyAccountSaved ? "account" : "device");
      setModelId("");
    }
  }, [providerId, accountConnections, selection.baseURL, selection.providerId]);

  useEffect(() => {
    if (!open || Object.keys(catalog.providers || {}).length > 0) return;
    setCatalogLoading(true);
    fetch("/api/models/catalog", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as CatalogResponse;
        if (response.ok) setCatalog(data);
      })
      .finally(() => setCatalogLoading(false));
  }, [open, catalog.providers]);

  useEffect(() => {
    if (!open || !authToken) return;
    fetch("/api/models/credentials", {
      headers: { Authorization: `Bearer ${authToken}` },
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setAccountConnections(data.connections || []);
      })
      .catch(() => {});
  }, [open, authToken]);

  const providerModels = useMemo(() => {
    if (provider.id === "cryzo") {
      return [
        {
          id: DEFAULT_MODEL_SELECTION.modelId,
          name: "MiniMax M3",
          reasoning: true,
          toolCall: true,
        } satisfies CatalogModel,
      ];
    }

    const items = discoveredModels.length
      ? discoveredModels
      : catalog.providers?.[provider.id]?.models || [];
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter(
      (model) =>
        model.name.toLowerCase().includes(query) ||
        model.id.toLowerCase().includes(query),
    );
  }, [catalog.providers, discoveredModels, provider.id, search]);

  const saveAccountCredential = async () => {
    if (!authToken) throw new Error("Your Cryzo session is still loading");
    if (!apiKey.trim()) {
      if (accountSaved) return;
      throw new Error("Enter an API key first");
    }

    const response = await fetch("/api/models/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        providerId,
        apiKey,
        baseURL: baseURL.trim() || undefined,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to save API key");
    setAccountConnections((current) => [
      ...current.filter((item) => item.providerId !== providerId),
      { providerId, baseUrl: baseURL.trim() || undefined },
    ]);
    setApiKey("");
  };

  const saveCredential = async () => {
    if (provider.id === "cryzo") return;
    setFeedback({ type: "saving", message: "Saving…" });
    setBusy(true);
    try {
      if (provider.local) {
        if (persistDevice) {
          storeDeviceProviderKey(providerId, apiKey);
          storeDeviceProviderBaseURL(providerId, baseURL);
        } else {
          storeSessionProviderKey(providerId, apiKey);
          storeSessionProviderBaseURL(providerId, baseURL);
        }
        setSavedDevice(Boolean(apiKey.trim()) || Boolean(baseURL.trim()));
      } else if (credentialMode === "account") {
        await saveAccountCredential();
      } else {
        if (!provider.custom && !apiKey.trim()) {
          throw new Error("Enter an API key first");
        }
        if (persistDevice) {
          storeDeviceProviderKey(providerId, apiKey);
          storeDeviceProviderBaseURL(providerId, baseURL);
        } else {
          storeSessionProviderKey(providerId, apiKey);
          storeSessionProviderBaseURL(providerId, baseURL);
        }
        setSavedDevice(Boolean(apiKey.trim()));
      }

      setFeedback({
        type: "saved",
        message:
          credentialMode === "account" && !provider.local
            ? "Saved securely to your Cryzo account"
            : persistDevice
              ? "Saved on this device"
              : "Saved for this session",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to save API key",
      });
    } finally {
      setBusy(false);
    }
  };

  const discoverLocalModels = async () => {
    const endpoint = (baseURL || provider.defaultBaseURL || "").replace(/\/$/, "");
    if (!endpoint) {
      setFeedback({ type: "error", message: "Enter a base URL first." });
      return;
    }

    setBusy(true);
    setFeedback({ type: "saving", message: "Connecting…" });
    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: apiKey.trim()
          ? { Authorization: `Bearer ${apiKey.trim()}` }
          : undefined,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || `Server returned ${response.status}`);
      }
      const models = (Array.isArray(data.data) ? data.data : [])
        .map((item: { id?: string }) => item.id)
        .filter(Boolean)
        .map((id: string) => ({ id, name: displayModelName(id) }));
      setDiscoveredModels(models);
      if (!modelId && models[0]) setModelId(models[0].id);
      setFeedback({
        type: "success",
        message: models.length
          ? `Connected · found ${models.length} model${models.length === 1 ? "" : "s"}`
          : "Connected, but no chat models were returned.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: `${
          error instanceof Error ? error.message : "Connection failed"
        }. Local servers must allow browser CORS from https://cryzo.me.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!modelId.trim()) {
      setFeedback({ type: "error", message: "Choose or enter a model ID." });
      return;
    }

    setBusy(true);
    setFeedback({ type: "idle" });
    try {
      if (provider.id === "cryzo") {
        onChange(DEFAULT_MODEL_SELECTION);
        setOpen(false);
        return;
      }

      if (!provider.local && credentialMode === "account") {
        if (!accountSaved || apiKey.trim()) await saveAccountCredential();
      } else if (credentialMode === "device") {
        const runtimeKey = readRuntimeProviderKey(providerId);
        if (!provider.local && !provider.custom && !apiKey.trim() && !runtimeKey) {
          throw new Error("Add and save an API key for this provider first");
        }
        if (apiKey.trim()) {
          if (persistDevice) {
            storeDeviceProviderKey(providerId, apiKey);
            storeDeviceProviderBaseURL(providerId, baseURL);
          } else {
            storeSessionProviderKey(providerId, apiKey);
            storeSessionProviderBaseURL(providerId, baseURL);
          }
          setSavedDevice(true);
        }
      }

      onChange({
        providerId,
        modelId: modelId.trim(),
        credentialMode: provider.local ? "device" : credentialMode,
        baseURL: baseURL.trim() || provider.defaultBaseURL,
      });
      setOpen(false);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to use model",
      });
      setTab("providers");
    } finally {
      setBusy(false);
    }
  };

  const selectedProvider = getProvider(selection.providerId);
  const selectedModelName = displayModelName(selection.modelId);
  const savedForCurrentMode =
    provider.id === "cryzo" ||
    provider.local ||
    (credentialMode === "account" ? accountSaved : savedDevice);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setTab("models");
          setOpen(true);
        }}
        className={
          compact
            ? "inline-flex h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
            : "inline-flex h-9 max-w-[190px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:text-white"
        }
        title={`${selectedProvider.name} · ${selection.modelId}`}
      >
        <ProviderMark provider={selectedProvider} />
        <span className="max-w-28 truncate">{selectedModelName}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            className="absolute inset-0"
            onClick={() => setOpen(false)}
            aria-label="Close model picker"
          />

          <div className="relative z-10 flex h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black sm:h-auto sm:max-h-[86vh] sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-white">AI models</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Pick a model or connect your own provider. Keys stay separate from model browsing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-2 border-b border-zinc-800 px-3 pt-2">
              <button
                type="button"
                onClick={() => setTab("models")}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium ${
                  tab === "models"
                    ? "border-white text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Models
              </button>
              <button
                type="button"
                onClick={() => setTab("providers")}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium ${
                  tab === "providers"
                    ? "border-white text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                API keys & providers
              </button>
            </div>

            <div className="border-b border-zinc-800 px-3 py-3">
              <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {PROVIDERS.map((item) => {
                  const accountConnected = accountConnections.some(
                    (connection) => connection.providerId === item.id,
                  );
                  const deviceConnected = Boolean(readRuntimeProviderKey(item.id));
                  const connected = item.id === "cryzo" || accountConnected || deviceConnected;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setProviderId(item.id)}
                      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-2.5 text-xs transition-colors ${
                        providerId === item.id
                          ? "border-zinc-600 bg-zinc-800 text-white"
                          : "border-zinc-800 bg-zinc-950 text-zinc-500 hover:text-zinc-300"
                      }`}
                    >
                      <ProviderMark provider={item} />
                      <span>{item.name}</span>
                      {connected && item.id !== "cryzo" && (
                        <Check size={13} className="text-green-400" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {tab === "models" ? (
                <div>
                  <div className="mb-4 flex items-start gap-3">
                    <ProviderMark provider={provider} />
                    <div className="min-w-0">
                      <div className="text-base font-medium text-white">{provider.name}</div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  {(provider.custom || provider.local) && (
                    <label className="mb-4 block">
                      <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                        Model ID
                      </span>
                      <input
                        value={modelId}
                        onChange={(event) => setModelId(event.target.value)}
                        placeholder="model-name"
                        className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                      />
                    </label>
                  )}

                  {!provider.custom && (
                    <>
                      <div className="relative mb-3">
                        <Search
                          size={16}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600"
                        />
                        <input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={`Search ${provider.name} models…`}
                          className="h-11 w-full rounded-xl border border-zinc-800 bg-zinc-900 pl-10 pr-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                        />
                      </div>

                      <div className="overflow-hidden rounded-xl border border-zinc-800">
                        {catalogLoading && provider.id !== "cryzo" ? (
                          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                            <Loader2 size={15} className="animate-spin" />
                            Loading current models…
                          </div>
                        ) : providerModels.length === 0 ? (
                          <div className="px-5 py-12 text-center text-sm leading-6 text-zinc-500">
                            No catalog models found for this provider.
                            {provider.local && " Connect the local server from API keys & providers."}
                          </div>
                        ) : (
                          providerModels.slice(0, 120).map((model) => {
                            const selected = modelId === model.id;
                            return (
                              <button
                                key={model.id}
                                type="button"
                                onClick={() => setModelId(model.id)}
                                className={`flex w-full items-center gap-3 border-b border-zinc-900 px-3 py-3 text-left last:border-b-0 ${
                                  selected ? "bg-zinc-800" : "hover:bg-zinc-900"
                                }`}
                              >
                                <ProviderMark provider={provider} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-white">
                                    {model.name}
                                  </div>
                                  <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-600">
                                    {model.id}
                                  </div>
                                </div>
                                <div className="hidden shrink-0 gap-1 text-[10px] text-zinc-500 sm:flex">
                                  {model.reasoning && (
                                    <span className="rounded bg-zinc-900 px-1.5 py-0.5">
                                      reasoning
                                    </span>
                                  )}
                                  {model.toolCall && (
                                    <span className="rounded bg-zinc-900 px-1.5 py-0.5">
                                      tools
                                    </span>
                                  )}
                                </div>
                                {selected && <Check size={16} className="shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}

                  {provider.id !== "cryzo" && !savedForCurrentMode && (
                    <button
                      type="button"
                      onClick={() => setTab("providers")}
                      className="mt-4 flex w-full items-center justify-between rounded-xl border border-amber-900/60 bg-amber-950/20 px-3 py-3 text-left text-xs text-amber-200"
                    >
                      <span>Add an API key before using this provider</span>
                      <Settings2 size={15} />
                    </button>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-5 flex items-start gap-3">
                    <ProviderMark provider={provider} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-medium text-white">{provider.name}</div>
                        {savedForCurrentMode && provider.id !== "cryzo" && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-1 text-[11px] font-medium text-green-400">
                            <CheckCircle2 size={12} /> Connected
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-zinc-500">
                        {provider.description}
                      </p>
                    </div>
                  </div>

                  {provider.id === "cryzo" ? (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-white">
                        <Server size={16} /> Cryzo-managed access
                      </div>
                      <p className="mt-2 text-xs leading-5 text-zinc-500">
                        No API key is required. Usage is billed through your Cryzo credits and plan.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/35 p-4 sm:p-5">
                      {!provider.local && (
                        <div className="mb-4 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setCredentialMode("device");
                              setFeedback({ type: "idle" });
                            }}
                            className={`rounded-xl border px-3 py-2.5 text-xs font-medium ${
                              credentialMode === "device"
                                ? "border-zinc-500 bg-zinc-800 text-white"
                                : "border-zinc-800 text-zinc-500"
                            }`}
                          >
                            This device
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCredentialMode("account");
                              setFeedback({ type: "idle" });
                            }}
                            className={`rounded-xl border px-3 py-2.5 text-xs font-medium ${
                              credentialMode === "account"
                                ? "border-zinc-500 bg-zinc-800 text-white"
                                : "border-zinc-800 text-zinc-500"
                            }`}
                          >
                            Cryzo account
                          </button>
                        </div>
                      )}

                      {(provider.custom || provider.local) && (
                        <label className="mb-4 block">
                          <span className="mb-1.5 block text-xs font-medium text-zinc-400">
                            Base URL
                          </span>
                          <input
                            value={baseURL}
                            onChange={(event) => {
                              setBaseURL(event.target.value);
                              setFeedback({ type: "idle" });
                            }}
                            placeholder={provider.defaultBaseURL || "https://api.example.com/v1"}
                            className="h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                          />
                        </label>
                      )}

                      <label className="block">
                        <span className="mb-1.5 flex items-center justify-between gap-3 text-xs font-medium text-zinc-400">
                          <span>
                            {provider.apiKeyLabel || "API key"}
                            {provider.local ? " (optional)" : ""}
                          </span>
                          {providerConsole && (
                            <a
                              href={providerConsole}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-normal text-zinc-500 hover:text-white"
                            >
                              Get API key <ExternalLink size={11} />
                            </a>
                          )}
                        </span>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={apiKey}
                            onChange={(event) => {
                              setApiKey(event.target.value);
                              setFeedback({ type: "idle" });
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                void saveCredential();
                              }
                            }}
                            placeholder={
                              accountSaved && credentialMode === "account"
                                ? "Saved to your Cryzo account"
                                : savedDevice && credentialMode === "device"
                                  ? "Saved on this device"
                                  : provider.apiKeyPlaceholder || "Paste API key"
                            }
                            autoComplete="off"
                            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-3 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => void saveCredential()}
                            disabled={
                              busy ||
                              (!provider.local &&
                                !provider.custom &&
                                !apiKey.trim() &&
                                !(credentialMode === "account" && accountSaved))
                            }
                            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-black disabled:opacity-40"
                          >
                            {feedback.type === "saving" ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : feedback.type === "saved" || savedForCurrentMode ? (
                              <Check size={14} />
                            ) : (
                              <KeyRound size={14} />
                            )}
                            {feedback.type === "saved" ? "Saved" : savedForCurrentMode ? "Save" : "Save"}
                          </button>
                        </div>
                      </label>

                      {credentialMode === "device" && (
                        <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-zinc-500">
                          <input
                            type="checkbox"
                            checked={persistDevice}
                            onChange={(event) => setPersistDevice(event.target.checked)}
                            className="mt-1"
                          />
                          <span>
                            Keep this credential on this device. Turn this off to keep it only for the current browser session.
                          </span>
                        </label>
                      )}

                      {credentialMode === "account" && !provider.local && (
                        <p className="mt-3 text-xs leading-5 text-zinc-500">
                          Account keys are AES-256-GCM encrypted before storage. Cryzo does not return the clear key to the browser.
                        </p>
                      )}

                      {provider.local && (
                        <button
                          type="button"
                          onClick={() => void discoverLocalModels()}
                          disabled={busy || !baseURL.trim()}
                          className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                        >
                          {busy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Laptop size={13} />
                          )}
                          Connect & discover models
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {feedback.message && (
                <div
                  className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs leading-5 ${
                    feedback.type === "error"
                      ? "border-red-900/70 bg-red-950/20 text-red-300"
                      : feedback.type === "saved" || feedback.type === "success"
                        ? "border-green-900/60 bg-green-950/20 text-green-300"
                        : "border-zinc-800 bg-zinc-900 text-zinc-400"
                  }`}
                >
                  {(feedback.type === "saved" || feedback.type === "success") && (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-zinc-800 px-4 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-10 rounded-lg px-3 text-sm text-zinc-500 hover:text-white"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={busy || !modelId.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Use {displayModelName(modelId || "model")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
