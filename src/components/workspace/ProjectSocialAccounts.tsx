"use client";
import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const networks = { twitter: "X", facebook: "Facebook Pages", instagram: "Instagram Business", youtube: "YouTube", reddit: "Reddit", tiktok: "TikTok" };
export default function ProjectSocialAccounts({ conversationId }: { conversationId: Id<"conversations"> }) {
  const token = useAuthToken();
  const bound = useQuery(api.social.listAccounts, { conversationId });
  const unbind = useMutation(api.social.unbindAccount);
  const [available, setAvailable] = useState<{ id: string; channel: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/social/accounts", { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAvailable(data.items);
    } catch { setError("Could not load accounts. Refresh to retry."); }
  }, [token]);
  useEffect(() => { void refresh(); const listener = () => void refresh(); window.addEventListener("focus", listener); return () => window.removeEventListener("focus", listener); }, [refresh]);
  async function connect(toolkit: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/connections", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ toolkit, returnTo: "/chat/" + conversationId }) });
      const data = await response.json();
      if (!response.ok || !data.redirectUrl) throw new Error(data.error || "This network needs an OAuth app configured in Composio.");
      window.location.assign(data.redirectUrl);
    } catch (error) { setError(error instanceof Error ? error.message : "Connection failed."); }
    finally { setBusy(false); }
  }
  async function attach(accountId: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/social/accounts", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, conversationId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (error) { setError(error instanceof Error ? error.message : "Could not add account."); }
    finally { setBusy(false); }
  }
  return <section className="border-b border-zinc-800 p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Project social accounts</h2><button className="rounded-lg border border-zinc-700 px-3 py-2 text-xs" onClick={() => setOpen(!open)}>Manage accounts</button></div>
    <div className="mt-3 flex flex-wrap gap-2">{bound?.map(account => <div key={account._id} className="rounded-lg border border-zinc-800 p-2 text-xs">{account.name} <button className="ml-3 text-zinc-500 underline" onClick={() => void unbind({ accountId: account._id }).catch(error => setError(error.message))}>Remove</button></div>)}
      {bound?.length === 0 && <p className="text-xs text-zinc-500">Connect a social account to publish. Drafts do not require a connection.</p>}</div>
    {open && <div className="mt-4 space-y-3"><div className="flex flex-wrap gap-2">{Object.entries(networks).map(([id, label]) => <button key={id} disabled={busy} onClick={() => void connect(id)} className="rounded-lg bg-zinc-900 px-3 py-2 text-xs">Connect {label}</button>)}</div>
      {available.filter(account => !bound?.some(item => item.connectedAccountId === account.id)).map(account => <button key={account.id} disabled={busy} onClick={() => void attach(account.id)} className="mr-2 rounded-lg border border-sky-900 px-3 py-2 text-xs text-sky-300">Use {account.name} in this project</button>)}
      <button className="block text-xs underline" onClick={() => void refresh()}>Refresh accounts</button>
      <p className="text-xs leading-5 text-zinc-500">One connection powers manual publishing, confirmed AI actions, and scheduling. Publishing depends on the permissions and approval of Cryzo&apos;s platform app.</p></div>}
    {error && <p role="alert" className="mt-3 text-xs text-red-400">{error}</p>}
  </section>;
}
