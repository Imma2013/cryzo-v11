"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

type Toolkit = {
  slug: string;
  name: string;
  logoUrl?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

function connectionsReturnPath() {
  const url = new URL(window.location.href);
  url.searchParams.set("connections", "1");
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ConnectionsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failedLogoSlugs, setFailedLogoSlugs] = useState<Set<string>>(
    () => new Set(),
  );

  const fetchToolkits = async () => {
    setLoading(true);
    const res = await fetch("/api/connections");
    const data = await res.json();
    setToolkits(data.toolkits);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function loadToolkits() {
      setLoading(true);
      const res = await fetch("/api/connections");
      const data = await res.json();

      if (!cancelled) {
        setToolkits(data.toolkits);
        setLoading(false);
      }
    }

    void loadToolkits();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const connect = async (slug: string) => {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        toolkit: slug,
        returnPath: connectionsReturnPath(),
      }),
    });
    const data = await res.json();
    if (data.redirectUrl) {
      window.location.href = data.redirectUrl;
    }
  };

  const disconnect = async (connectedAccountId: string) => {
    await fetch("/api/connections/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectedAccountId }),
    });
    await fetchToolkits();
  };

  const markLogoFailed = (slug: string) => {
    setFailedLogoSlugs((current) => {
      const next = new Set(current);
      next.add(slug);
      return next;
    });
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-2xl flex-col rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              App Connections
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              Connect your apps to let Cryzo perform actions on your behalf.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
            aria-label="Close connections"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-zinc-500" size={24} />
            </div>
          ) : (
            <div className="grid gap-1">
              {toolkits.map((t) => {
                const showLogo = t.logoUrl && !failedLogoSlugs.has(t.slug);

                return (
                  <div
                    key={t.slug}
                    className="flex items-center gap-4 border-b border-zinc-900 py-3 last:border-b-0"
                  >
                    <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded bg-zinc-900">
                      {showLogo ? (
                        <img
                          src={t.logoUrl}
                          alt={t.name}
                          className="h-6 w-6 object-contain"
                          onError={() => markLogoFailed(t.slug)}
                        />
                      ) : (
                        <span className="text-xs text-zinc-500">
                          {t.name.charAt(0)}
                        </span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-white">
                        {t.name}
                      </p>
                      <p
                        className={`text-xs ${
                          t.isConnected ? "text-green-400" : "text-zinc-500"
                        }`}
                      >
                        {t.isConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>

                    {t.isConnected ? (
                      <button
                        type="button"
                        onClick={() => disconnect(t.connectedAccountId!)}
                        className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:text-red-400"
                      >
                        Disconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => connect(t.slug)}
                        className="rounded bg-white px-3 py-1.5 text-xs font-medium text-black transition-colors hover:bg-zinc-200"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
