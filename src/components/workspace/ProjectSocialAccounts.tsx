"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Check, Loader2, Plus, Unplug } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const networks = [
  { toolkit: "twitter", channel: "x", label: "X", mark: "X", accent: "bg-white text-black" },
  { toolkit: "facebook", channel: "facebook", label: "Facebook", mark: "f", accent: "bg-[#1877f2] text-white" },
  { toolkit: "instagram", channel: "instagram", label: "Instagram", mark: "◎", accent: "bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white" },
  { toolkit: "youtube", channel: "youtube", label: "YouTube", mark: "▶", accent: "bg-[#ff0033] text-white" },
  { toolkit: "reddit", channel: "reddit", label: "Reddit", mark: "r/", accent: "bg-[#ff4500] text-white" },
  { toolkit: "tiktok", channel: "tiktok", label: "TikTok", mark: "♪", accent: "bg-black text-white ring-1 ring-zinc-700" },
  { toolkit: "linkedin", channel: "linkedin", label: "LinkedIn", mark: "in", accent: "bg-[#0a66c2] text-white" },
] as const;

export default function ProjectSocialAccounts() {
  const token = useAuthToken();
  const bound = useQuery(api.social.listAccounts, {});
  const unbind = useMutation(api.social.unbindAccount);
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(api.social.getAccess, { now: accessNow });
  const callbackHandled = useRef(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyToolkit, setBusyToolkit] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (!token || callbackHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const connectedAccountId = params.get("connected_account_id");
    const status = params.get("status");

    if (status === "error") {
      callbackHandled.current = true;
      setError("The social account connection was not completed.");
      return;
    }
    if (status !== "success" || !connectedAccountId) return;

    callbackHandled.current = true;
    setFinalizing(true);
    setError("");
    void fetch("/api/social/accounts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ accountId: connectedAccountId }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not finish connecting the account.");
        params.delete("status");
        params.delete("connected_account_id");
        const query = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
        setNotice("Account connected and ready to publish.");
        setOpen(true);
      })
      .catch((connectionError) => {
        setError(
          connectionError instanceof Error
            ? connectionError.message
            : "Could not finish connecting the account.",
        );
      })
      .finally(() => setFinalizing(false));
  }, [token]);

  async function connect(toolkit: string) {
    if (!token) return;
    setBusyToolkit(toolkit);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ toolkit, returnTo: "/chat/marketing" }),
      });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl) {
        throw new Error(
          data.error || "This network needs an OAuth app configured in Composio.",
        );
      }
      window.location.assign(data.redirectUrl);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Connection failed.",
      );
      setBusyToolkit(null);
    }
  }

  async function disconnect(accountId: Id<"socialAccounts">) {
    setError("");
    setNotice("");
    try {
      await unbind({ accountId });
      setNotice("Account disconnected from Marketing.");
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not disconnect account.");
    }
  }

  const accountCount = bound?.length ?? 0;
  const canAddAnother = Boolean(access?.canSchedule || accountCount === 0);

  return (
    <section id="social-accounts" className="border-b border-zinc-700 bg-[#0c0c0c] px-5 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-white">Social accounts</h2>
            {accountCount > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                {accountCount} connected
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            Connect once, then use the account for manual posts, AI drafts, and scheduling.
          </p>
        </div>
        <button
          type="button"
          className="rounded-xl border border-zinc-600 px-3 py-2 text-xs font-semibold text-white transition hover:border-zinc-400"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Done" : "Manage accounts"}
        </button>
      </div>

      {!open && accountCount > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {bound?.map((account) => {
            const network = networks.find((item) => item.channel === account.channel);
            return (
              <div key={account._id} className="flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200">
                <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold ${network?.accent ?? "bg-zinc-700"}`}>
                  {network?.mark ?? "•"}
                </span>
                <span>{account.name}</span>
                <Check size={12} className="text-emerald-400" />
              </div>
            );
          })}
        </div>
      )}

      {open && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {networks.map((network) => {
            const accounts = bound?.filter((account) => account.channel === network.channel) ?? [];
            const connecting = busyToolkit === network.toolkit;
            return (
              <article key={network.toolkit} className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4">
                <div className="flex items-start gap-3">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-bold ${network.accent}`}>
                    {network.mark}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-white">{network.label}</h3>
                    {accounts.length ? (
                      <div className="mt-1 space-y-2">
                        {accounts.map((account) => (
                          <div key={account._id} className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs text-emerald-300">
                              <Check size={11} className="mr-1 inline" />
                              {account.name}
                            </span>
                            <button
                              type="button"
                              onClick={() => void disconnect(account._id)}
                              className="text-zinc-500 transition hover:text-red-400"
                              aria-label={`Disconnect ${account.name}`}
                              title="Disconnect"
                            >
                              <Unplug size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-500">Not connected</p>
                    )}
                  </div>
                </div>
                {(accounts.length === 0 || canAddAnother) && (
                  <button
                    type="button"
                    disabled={connecting || finalizing}
                    onClick={() => void connect(network.toolkit)}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 text-xs font-semibold text-black transition hover:bg-white disabled:opacity-50"
                  >
                    {connecting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    {accounts.length ? "Connect another" : "Connect"}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {finalizing && (
        <p className="mt-3 flex items-center gap-2 text-xs text-sky-300">
          <Loader2 size={13} className="animate-spin" />
          Finishing your connection…
        </p>
      )}
      {notice && <p className="mt-3 text-xs text-emerald-300">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
    </section>
  );
}
