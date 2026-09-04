"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Laptop,
  Loader2,
  Search,
  Server,
  Sparkles,
  X,
  Zap,
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
} from "@/lib/ai/models";
import {
  CRYZO_MANAGED_MODELS,
  normalizeManagedModelId,
  getManagedModel,
} from "@/lib/ai/managed-models";
import { ModelLogo, ProviderLogo } from "@/components/ProviderLogo";

export type CatalogModel = {
  id: string;
  name: string;
  reasoning?: boolean;
  toolCall?: boolean;
  available?: boolean;
  attachments?: boolean;
  context?: number | null;
  output?: number | null;
  lastUpdated?: string | null;
  inputCost?: number | null;
  outputCost?: number | null;
};

type CatalogResponse = {
  providers?: Record<string, { models?: CatalogModel[] }>;
};

type AccountConnection = {
  providerId: string;
  baseUrl?: string;
};

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

function formatContext(value?: number | null) {
  if (!value) return null;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value % 1_000_000 ? 1 : 0)}M ctx`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K ctx`;
  return `${value} ctx`;
}

function ModelBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "free" | "premium" | "byok";
}) {
  const classes = {
    neutral: "border-zinc-800 bg-zinc-900 text-zinc-400",
    free: "border-emerald-900/70 bg-emerald-950/50 text-emerald-300",
    premium: "border-violet-900/70 bg-violet-950/50 text-violet-300",
    byok: "border-sky-900/70 bg-sky-950/50 text-sky-300",
  }[tone];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${classes}`}>
      {children}
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
  const [providerId, setProviderId] = useState(selection.providerId || "cryzo");
  const [modelId, setModelId] = useState(
    selection.providerId === "cryzo"
      ? normalizeManagedModelId(selection.modelId)
      : selection.modelId || DEFAULT_MODEL_SELECTION.modelId,
  );
  const [credentialMode, setCredentialMode] = useState<CredentialMode>(selection.credentialMode || "cryzo");
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(selection.baseURL || "");
  const [persistDevice, setPersistDevice] = useState(true);
  const [savedDevice, setSavedDevice] = useState(false);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse>({});
  const [catalogError, setCatalogError] = useState("");
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [accountConnections, setAccountConnections] = useState<AccountConnection[]>([]);
  const [feedback, setFeedback] = useState<Feedback>({ type: "idle" });
  const [busy, setBusy] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);

  const provider = getProvider(providerId);
  const selectedProvider = getProvider(selection.providerId);
  const selectedModelId =
    selectedProvider.id === "cryzo"
      ? normalizeManagedModelId(selection.modelId)
      : selection.modelId;
  const selectedModelName = displayModelName(selectedModelId);
  const accountSaved = accountConnections.some((item) => item.providerId === providerId);
  const providerConsole = PROVIDER_CONSOLES[providerId];

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("cryzo:open-model-picker", handler);
    return () => window.removeEventListener("cryzo:open-model-picker", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setProviderId(selection.providerId || "cryzo");
    setModelId(
      selection.providerId === "cryzo"
        ? normalizeManagedModelId(selection.modelId)
        : selection.modelId || DEFAULT_MODEL_SELECTION.modelId,
    );
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
      setModelId(normalizeManagedModelId(modelId));
    } else if (nextProvider.local) {
      setCredentialMode("device");
    } else if (selection.providerId !== providerId) {
      const saved = accountConnections.some((connection) => connection.providerId === providerId);
      setCredentialMode(saved ? "account" : "device");
      setModelId("");
    }
  }, [providerId, accountConnections, selection.baseURL, selection.providerId]);

  useEffect(() => {
    if (!open || Object.keys(catalog.providers || {}).length > 0) return;
    setCatalogLoading(true);
    setCatalogError("");
    fetch("/api/models/catalog", { cache: "no-store" })
      .then(async (response) => {
        const data = (await response.json()) as CatalogResponse;
        if (!response.ok) throw new Error("The model catalog is unavailable. Please retry.");
        setCatalog(data);
      })
      .catch(error => setCatalogError(error instanceof Error ? error.message : "Unable to load models."))
      .finally(() => setCatalogLoading(false));
  }, [open, catalog.providers, catalogRetry]);

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

  const providerModels = useMemo<CatalogModel[]>(() => {
    if (provider.id === "cryzo") {
      const query = search.trim().toLowerCase();
      return (catalog.providers?.cryzo?.models ?? []).filter(
        (model) =>
          !query ||
          model.name.toLowerCase().includes(query) ||
          model.id.toLowerCase().includes(query),
      ).map((model) => ({
        id: model.id,
        name: model.name,
        reasoning: model.reasoning,
        toolCall: model.toolCall,
        attachments: model.attachments,
        context: model.context, inputCost: model.inputCost, outputCost: model.outputCost,
      }));
    }

    const items: CatalogModel[] = discoveredModels.length
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
        if (!provider.custom && !apiKey.trim()) throw new Error("Enter an API key first");
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
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to save API key" });
    } finally {
      setBusy(false);
    }
  };

  const testCredential = async () => {
    if (provider.local) {
      await discoverLocalModels();
      return;
    }

    setBusy(true);
    setFeedback({ type: "saving", message: "Testing connection…" });
    try {
      const runtimeKey = apiKey.trim() || readRuntimeProviderKey(providerId);
      const response = await fetch("/api/models/credentials/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          providerId,
          credentialMode,
          apiKey: credentialMode === "device" ? runtimeKey : apiKey.trim() || undefined,
          baseURL: baseURL.trim() || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Connection test failed");
      setFeedback({
        type: "success",
        message: data.message || "Connected successfully.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Connection test failed",
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
        headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Server returned ${response.status}`);
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
        message: `${error instanceof Error ? error.message : "Connection failed"}. Local servers must allow browser CORS from https://cryzo.me.`,
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
        onChange({
          providerId: "cryzo",
          modelId: normalizeManagedModelId(modelId),
          credentialMode: "cryzo",
        });
        setOpen(false);
        return;
      }

      if (!provider.local && credentialMode === "account") {
        if (!accountSaved || apiKey.trim()) await saveAccountCredential();
      } else {
        const runtimeKey = readRuntimeProviderKey(providerId);
        if (!provider.local && !provider.custom && !apiKey.trim() && !runtimeKey) {
          throw new Error("Add and save an API key for this provider first");
        }
        if (apiKey.trim() || baseURL.trim()) {
          if (persistDevice) {
            storeDeviceProviderKey(providerId, apiKey);
            storeDeviceProviderBaseURL(providerId, baseURL);
          } else {
            storeSessionProviderKey(providerId, apiKey);
            storeSessionProviderBaseURL(providerId, baseURL);
          }
          setSavedDevice(Boolean(apiKey.trim()) || Boolean(provider.local));
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
      setFeedback({ type: "error", message: error instanceof Error ? error.message : "Unable to use model" });
    } finally {
      setBusy(false);
    }
  };

  const savedForCurrentMode =
    provider.id === "cryzo" ||
    provider.local ||
    (credentialMode === "account" ? accountSaved : savedDevice);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "inline-flex h-9 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
            : "inline-flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:text-white"
        }
        title={`${selectedProvider.name} · ${selectedModelId}`}
      >
        <ModelLogo provider={selectedProvider} modelId={selectedModelId} size={26} />
        <span className="max-w-32 truncate">{selectedModelName}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button className="absolute inset-0" onClick={() => setOpen(false)} aria-label="Close model picker" />

          <div className="relative z-10 flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl sm:h-[760px] sm:rounded-2xl">
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-base font-semibold text-white">Choose your model</h2>
                <p className="mt-0.5 text-xs text-zinc-500">BYOK models never spend Cryzo message credits.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white">
                <X size={18} />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[230px_minmax(0,1fr)]">
              <aside className="border-b border-zinc-800 p-3 md:overflow-y-auto md:border-b-0 md:border-r">
                <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Providers</div>
                <div className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible">
                  {PROVIDERS.map((item) => {
                    const active = item.id === providerId;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setProviderId(item.id);
                          setSearch("");
                        }}
                        className={`flex min-w-max items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors md:w-full ${
                          active ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                        }`}
                      >
                        <ProviderLogo provider={item} size={28} />
                        <span className="truncate font-medium">{item.name}</span>
                        {item.id !== "cryzo" && !item.local && (
                          <span className={`ml-auto hidden text-[9px] md:inline ${active ? "text-zinc-500" : "text-sky-400"}`}>BYOK</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </aside>

              <main className="min-h-0 overflow-y-auto p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <ProviderLogo provider={provider} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{provider.name}</h3>
                      {provider.id === "cryzo" ? (
                        <ModelBadge tone="free">No key required</ModelBadge>
                      ) : provider.local ? (
                        <ModelBadge>Local</ModelBadge>
                      ) : (
                        <ModelBadge tone="byok">BYOK · 0 Cryzo message credits</ModelBadge>
                      )}
                    </div>
                    <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">{provider.description}</p>
                  </div>
                </div>

                {provider.id !== "cryzo" && (
                  <section className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-medium text-white">
                          {provider.local ? <Laptop size={15} /> : <KeyRound size={15} />}
                          {provider.local ? "Local connection" : "Your API key"}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">
                          {provider.local
                            ? "Requests stay on the provider you run locally."
                            : "You pay the provider directly. Cryzo message credits are not used."}
                        </p>
                      </div>
                      {providerConsole && (
                        <a href={providerConsole} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white">
                          Get key <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    {!provider.local && (
                      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-black p-1">
                        <button
                          type="button"
                          onClick={() => setCredentialMode("device")}
                          className={`rounded-lg px-3 py-2 text-xs ${credentialMode === "device" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
                        >
                          This device
                        </button>
                        <button
                          type="button"
                          onClick={() => setCredentialMode("account")}
                          className={`rounded-lg px-3 py-2 text-xs ${credentialMode === "account" ? "bg-zinc-800 text-white" : "text-zinc-500"}`}
                        >
                          Cryzo account
                        </button>
                      </div>
                    )}

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs text-zinc-500">
                        {provider.apiKeyLabel || "API key"}
                        <input
                          type="password"
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          placeholder={provider.apiKeyPlaceholder || (accountSaved ? "Saved on your account" : "Paste key")}
                          className="mt-1.5 h-10 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600"
                        />
                      </label>
                      <label className="block text-xs text-zinc-500">
                        Base URL
                        <input
                          value={baseURL}
                          onChange={(event) => setBaseURL(event.target.value)}
                          placeholder={provider.defaultBaseURL || "https://.../v1"}
                          className="mt-1.5 h-10 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600"
                        />
                      </label>
                    </div>

                    {(provider.custom || provider.local) && (
                      <label className="mt-3 block text-xs text-zinc-500">
                        Model ID
                        <input
                          value={modelId}
                          onChange={(event) => setModelId(event.target.value)}
                          placeholder="model-name"
                          className="mt-1.5 h-10 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600"
                        />
                      </label>
                    )}

                    {credentialMode === "device" && (
                      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-500">
                        <input type="checkbox" checked={persistDevice} onChange={(event) => setPersistDevice(event.target.checked)} />
                        Remember on this device
                      </label>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveCredential()}
                        disabled={busy}
                        className="inline-flex h-9 items-center gap-2 rounded-xl border border-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
                      >
                        {busy && feedback.type === "saving" ? <Loader2 className="animate-spin" size={13} /> : <Server size={13} />}
                        Save connection
                      </button>
                      {!provider.local && (
                        <button
                          type="button"
                          onClick={() => void testCredential()}
                          disabled={busy}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                        >
                          <Zap size={13} /> Test key
                        </button>
                      )}
                      {provider.local && (
                        <button
                          type="button"
                          onClick={() => void discoverLocalModels()}
                          disabled={busy}
                          className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-medium text-black disabled:opacity-50"
                        >
                          <Zap size={13} /> Connect & discover
                        </button>
                      )}
                      {savedForCurrentMode && provider.id !== "cryzo" && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400"><CheckCircle2 size={12} /> Connected</span>
                      )}
                    </div>

                    {feedback.message && (
                      <p className={`mt-3 text-xs ${feedback.type === "error" ? "text-red-400" : feedback.type === "success" || feedback.type === "saved" ? "text-emerald-400" : "text-zinc-500"}`}>
                        {feedback.message}
                      </p>
                    )}
                  </section>
                )}

                <div className="relative mt-5">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" size={15} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search models"
                    className="h-10 w-full rounded-xl border border-zinc-800 bg-black pl-9 pr-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600"
                  />
                </div>

                <section className="mt-3 space-y-2">
                  {catalogError && <div role="alert" className="rounded-xl border border-red-900 p-3 text-sm text-red-300">{catalogError} <button onClick={() => setCatalogRetry(value => value + 1)} className="underline">Retry</button></div>}
                  {catalogLoading && !provider.local && (
                    <div className="flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-4 text-xs text-zinc-500">
                      <Loader2 className="animate-spin" size={14} /> Loading model catalog…
                    </div>
                  )}

                  {provider.id === "cryzo" ? (
                    providerModels.map((model) => {
                      const active = modelId === model.id;
                      const managed = getManagedModel(model.id);
                      return (
                        <button
                          key={model.id}
                          type="button"
                          disabled={model.available === false}
                          onClick={() => setModelId(model.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            active ? "border-zinc-500 bg-zinc-900" : "border-zinc-800 bg-black/40 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <ModelLogo provider={provider} modelId={model.id} size={34} />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-medium text-white">{model.name}{model.available === false ? " (temporarily unavailable)" : ""}</span>
                                  <ModelBadge tone={managed.tier === "free" ? "free" : "premium"}>
                                    {managed.badge}
                                  </ModelBadge>
                                  {managed.minimumPlan === "starter" && (
                                    <ModelBadge>Starter</ModelBadge>
                                  )}
                                </div>
                                <p className="mt-1 text-xs text-zinc-400">{formatContext(model.context)}{managed.tier === "premium" && model.inputCost != null && model.outputCost != null ? ` · $${(model.inputCost * 1_000_000).toFixed(2)} input / $${(model.outputCost * 1_000_000).toFixed(2)} output per 1M tokens` : ""}</p>
                              </div>
                            </div>
                            {active && <CheckCircle2 className="shrink-0 text-white" size={17} />}
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    providerModels.slice(0, 100).map((model) => {
                      const active = modelId === model.id;
                      return (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setModelId(model.id)}
                          className={`w-full rounded-xl border p-3 text-left transition-colors ${
                            active ? "border-sky-700 bg-sky-950/20" : "border-zinc-800 bg-black/40 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <ModelLogo provider={provider} modelId={model.id} size={34} />
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-medium text-white">{model.name}</span>
                                  <ModelBadge tone="byok">BYOK</ModelBadge>
                                  {model.reasoning && <ModelBadge>Reasoning</ModelBadge>}
                                  {model.toolCall && <ModelBadge>Tools</ModelBadge>}
                                  {formatContext(model.context) && <ModelBadge>{formatContext(model.context)}</ModelBadge>}
                                </div>
                                <p className="mt-1 truncate text-[11px] text-zinc-600">{model.id}</p>
                              </div>
                            </div>
                            {active && <CheckCircle2 className="shrink-0 text-sky-300" size={17} />}
                          </div>
                        </button>
                      );
                    })
                  )}

                  {!catalogLoading && providerModels.length === 0 && (
                    <div className="rounded-xl border border-dashed border-zinc-800 px-4 py-7 text-center text-xs text-zinc-500">
                      {provider.local ? "Connect to discover local models." : "No models matched your search."}
                    </div>
                  )}
                </section>


              </main>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-black/40 px-4 py-3 sm:px-5">
              <div className="min-w-0 text-xs text-zinc-500">
                {provider.id === "cryzo" ? (
                  <span className="inline-flex items-center gap-1.5"><Sparkles size={13} /> Managed AI · exact usage from your dollar allowance</span>
                ) : (
                  <span>BYOK · unlimited app creation · 0 Cryzo message credits</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => void apply()}
                disabled={busy || !modelId.trim()}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
              >
                {busy ? <Loader2 className="animate-spin" size={14} /> : null}
                Use model
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

