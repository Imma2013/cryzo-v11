"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Toolkit = {
  slug: string;
  name: string;
  logoUrl?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

export default function ConnectionsPage() {
  const [toolkits, setToolkits] = useState<Toolkit[]>([]);
  const [loading, setLoading] = useState(true);
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
    let cancelled = false;

    async function loadToolkits() {
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
  }, []);

  const connect = async (slug: string) => {
    const res = await fetch("/api/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolkit: slug }),
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
    fetchToolkits();
  };

  const markLogoFailed = (slug: string) => {
    setFailedLogoSlugs((current) => {
      const next = new Set(current);
      next.add(slug);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-black p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-2xl font-bold text-white">App Connections</h1>
        <p className="mb-8 text-sm text-zinc-400">
          Connect your apps to let Cryzo perform actions on your behalf.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-zinc-500" size={24} />
          </div>
        ) : (
          <div className="grid gap-3">
            {toolkits.map((t) => {
              const showLogo = t.logoUrl && !failedLogoSlugs.has(t.slug);

              return (
                <div
                  key={t.slug}
                  className="flex items-center gap-4 border-b border-zinc-800 py-4"
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

                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{t.name}</p>
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
                      onClick={() => disconnect(t.connectedAccountId!)}
                      className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-red-800 hover:text-red-400"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
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
  );
}
