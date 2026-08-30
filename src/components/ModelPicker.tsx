"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  Check,
  ChevronDown,
  KeyRound,
  Laptop,
  Loader2,
  Search,
  Server,
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
  const [modelId, setModelId] = useState(selection.modelId || DEFAULT_MODEL_SELECTION.modelId);
  const [credentialMode, setCredentialMode] = useState<CredentialMode>(
    selection.credentialMode || "cryzo",
  );
  const [apiKey, setApiKey] = useState("");
  const [baseURL, setBaseURL] = useState(selection.baseURL || "");
  const [persistDevice, setPersistDevice] = useState(true);
  const [search, setSearch] = useState("");
  const [catalog, setCatalog] = useState<CatalogResponse>({});
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [accountConnections, setAccountConnections] = useState<AccountConnection[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<CatalogModel[]>([]);

  const provider = getProvider(providerId);
  const accountSaved = accountConnections.some((item) => item.providerId === providerId);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("cryzo:open-model-picker", handler);
    return () => window.removeEventListener("cryzo:open-model-picker", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setProviderId(selection.providerId || "cryzo");
    setModelId(selection.modelId || DEFAULT_MODEL_SELECTION.modelId);
    setCredentialMode(selection.credentialMode || "cryzo");
    setSearch("");
    setStatus(null);
  }, [open, selection]);

  useEffect(() => {
    const nextProvider = getProvider(providerId);
    const storedBase = readRuntimeProviderBaseURL(providerId);
    setApiKey(readRuntimeProviderKey(providerId));
    setBaseURL(storedBase || selection.baseURL || nextProvider.defaultBaseURL || "");
    setDiscoveredModels([]);
    setStatus(null);
    if (nextProvider.id === "cryzo") {
      setCredentialMode("cryzo");
      setModelId(DEFAULT_MODEL_SELECTION.modelId);
    } else if (nextProvider.local) {
      setCredentialMode("device");
    } else if (selection.providerId !== providerId) {
      setCredentialMode(accountSaved ? "account" : "device");
      setModelId("");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId]);

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
    if (!apiKey.trim()) throw new Error("Enter an API key first");
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
  };

  const discoverLocalModels = async () => {
    const endpoint = (baseURL || provider.defaultBaseURL || "").replace(/\/$/, "");
    if (!endpoint) return setStatus("Enter a base URL first.");
    setBusy(true);
    setStatus(null);
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
      setStatus(models.length ? `Found ${models.length} model${models.length === 1 ? "" : "s"}.` : "Connected, but no chat models were returned.");
    } catch (error) {
      setStatus(
        `${error instanceof Error ? error.message : "Connection failed"}. Local servers must allow browser CORS from https://cryzo.me.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!modelId.trim()) return setStatus("Choose or enter a model ID.");
    setBusy(true);
    setStatus(null);
    try {
      if (provider.id === "cryzo") {
        onChange(DEFAULT_MODEL_SELECTION);
        setOpen(false);
        return;
      }

      if (!provider.local && credentialMode === "account") {
        if (!accountSaved || apiKey.trim()) await saveAccountCredential();
      } else if (credentialMode === "device") {
        if (!provider.local && !provider.custom && !apiKey.trim()) {
          throw new Error("Enter an API key");
        }
        if (persistDevice) {
          storeDeviceProviderKey(providerId, apiKey);
          storeDeviceProviderBaseURL(providerId, baseURL);
        } else {
          storeSessionProviderKey(providerId, apiKey);
          storeSessionProviderBaseURL(providerId, baseURL);
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
      setStatus(error instanceof Error ? error.message : "Unable to save model settings");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={compact
          ? "inline-flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-white"
          : "inline-flex h-8 max-w-[170px] items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:text-white"}
        title={`${getProvider(selection.providerId).name} · ${selection.modelId}`}
      >
        <span className="truncate">{displayModelName(selection.modelId)}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button className="absolute inset-0" onClick={() => setOpen(false)} aria-label="Close model picker" />
          <div className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black sm:max-h-[86vh] sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Models & API keys</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">Choose a current model from models.dev, bring your own cloud key, or connect a local OpenAI-compatible server.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden sm:grid-cols-[210px_1fr]">
              <div className="max-h-48 overflow-y-auto border-b border-zinc-800 p-2 sm:max-h-none sm:border-b-0 sm:border-r">
                {PROVIDERS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProviderId(item.id)}
                    className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm ${providerId === item.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
                  >
                    {item.local ? <Laptop size={15} /> : item.id === "cryzo" ? <Server size={15} /> : <KeyRound size={15} />}
                    <span className="truncate">{item.name}</span>
                    {accountConnections.some((connection) => connection.providerId === item.id) && <Check size={13} className="ml-auto text-green-400" />}
                  </button>
                ))}
              </div>

              <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
                <div className="mb-4">
                  <div className="text-base font-medium text-white">{provider.name}</div>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{provider.description}</p>
                </div>

                {provider.id !== "cryzo" && (
                  <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                    {(provider.custom || provider.local) && (
                      <label className="mb-3 block">
                        <span className="mb-1.5 block text-xs font-medium text-zinc-400">Base URL</span>
                        <input value={baseURL} onChange={(event) => setBaseURL(event.target.value)} placeholder={provider.defaultBaseURL || "https://api.example.com/v1"} className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-base text-white outline-none placeholder:text-zinc-600 sm:text-sm" />
                      </label>
                    )}

                    {!provider.local && (
                      <div className="mb-3 grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setCredentialMode("device")} className={`rounded-lg border px-3 py-2 text-xs ${credentialMode === "device" ? "border-blue-500 bg-blue-500/10 text-white" : "border-zinc-800 text-zinc-400"}`}>This device</button>
                        <button type="button" onClick={() => setCredentialMode("account")} className={`rounded-lg border px-3 py-2 text-xs ${credentialMode === "account" ? "border-blue-500 bg-blue-500/10 text-white" : "border-zinc-800 text-zinc-400"}`}>Cryzo account</button>
                      </div>
                    )}

                    {(credentialMode === "device" || credentialMode === "account") && (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-medium text-zinc-400">{provider.apiKeyLabel || "API key"}{provider.local ? " (optional)" : ""}</span>
                        <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={accountSaved && credentialMode === "account" ? "Saved on your Cryzo account" : provider.apiKeyPlaceholder || "API key"} autoComplete="off" className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-base text-white outline-none placeholder:text-zinc-600 sm:text-sm" />
                      </label>
                    )}

                    {credentialMode === "device" && !provider.local && (
                      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                        <input type="checkbox" checked={persistDevice} onChange={(event) => setPersistDevice(event.target.checked)} />
                        Save API key for future sessions on this device
                      </label>
                    )}

                    {credentialMode === "account" && (
                      <p className="mt-3 text-xs leading-5 text-zinc-500">Account keys are AES-256-GCM encrypted before being stored in Convex. Cryzo never returns the clear key to the browser.</p>
                    )}

                    {provider.local && (
                      <button type="button" onClick={() => void discoverLocalModels()} disabled={busy || !baseURL.trim()} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-xs text-zinc-200 disabled:opacity-40">
                        {busy ? <Loader2 size={13} className="animate-spin" /> : <Laptop size={13} />}Discover local models
                      </button>
                    )}
                  </div>
                )}

                {(provider.custom || provider.local) && (
                  <label className="mb-4 block">
                    <span className="mb-1.5 block text-xs font-medium text-zinc-400">Model ID</span>
                    <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="model-name" className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-base text-white outline-none placeholder:text-zinc-600 sm:text-sm" />
                  </label>
                )}

                {!provider.custom && (
                  <>
                    <div className="relative mb-3">
                      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search models..." className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 pl-9 pr-3 text-base text-white outline-none placeholder:text-zinc-600 sm:text-sm" />
                    </div>
                    <div className="max-h-72 overflow-y-auto rounded-xl border border-zinc-800">
                      {catalogLoading && provider.id !== "cryzo" ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm text-zinc-500"><Loader2 size={15} className="animate-spin" />Loading current models…</div>
                      ) : providerModels.length === 0 ? (
                        <div className="py-10 text-center text-sm text-zinc-500">No catalog models found. Enter a model ID above if this provider supports custom IDs.</div>
                      ) : (
                        providerModels.slice(0, 120).map((model) => (
                          <button key={model.id} type="button" onClick={() => setModelId(model.id)} className={`flex w-full items-start justify-between gap-3 border-b border-zinc-900 px-3 py-3 text-left last:border-b-0 ${modelId === model.id ? "bg-blue-500/10" : "hover:bg-zinc-900"}`}>
                            <div className="min-w-0">
                              <div className="truncate text-sm text-white">{model.name}</div>
                              <div className="mt-0.5 truncate font-mono text-[11px] text-zinc-600">{model.id}</div>
                            </div>
                            <div className="flex shrink-0 gap-1 text-[10px] text-zinc-500">
                              {model.reasoning && <span className="rounded bg-zinc-800 px-1.5 py-0.5">reasoning</span>}
                              {model.toolCall && <span className="rounded bg-zinc-800 px-1.5 py-0.5">tools</span>}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}

                {status && <p className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs leading-5 text-zinc-400">{status}</p>}

                <div className="mt-5 flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setOpen(false)} className="h-10 rounded-lg px-4 text-sm text-zinc-400 hover:text-white">Cancel</button>
                  <button type="button" onClick={() => void apply()} disabled={busy || !modelId.trim()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40">
                    {busy && <Loader2 size={14} className="animate-spin" />}Use model
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
