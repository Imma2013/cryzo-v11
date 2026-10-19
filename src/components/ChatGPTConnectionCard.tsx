"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Loader2 } from "lucide-react";
type Status={enabled:boolean;connected:boolean;email?:string;reason?:string};
export function ChatGPTConnectionCard() {
  const token=useAuthToken();const [status,setStatus]=useState<Status|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const refresh=useCallback(async()=>{if(!token)return;const res=await fetch("/api/chatgpt",{headers:{Authorization:"Bearer "+token},cache:"no-store"});if(!res.ok)throw new Error("Unable to check ChatGPT connection");setStatus(await res.json());},[token]);
  useEffect(()=>{let active=true;void refresh().catch(()=>{if(active)setError("Unable to check ChatGPT connection. Reload to retry.");});if(new URLSearchParams(location.search).get("chatgpt")==="retry")setError("ChatGPT sign-in could not finish. Start a new connection.");return()=>{active=false;};},[refresh]);
  async function connect() {if(!token)return;setBusy(true);setError("");try{const res=await fetch("/api/chatgpt/connect",{method:"POST",headers:{Authorization:"Bearer "+token}});const data=await res.json();if(!res.ok)throw new Error(data.error || "Unable to connect ChatGPT");location.assign(data.url);}catch(e){setError(e instanceof Error?e.message:"Unable to connect ChatGPT");setBusy(false);}}
  async function disconnect(){if(!token)return;setBusy(true);try{const res=await fetch("/api/chatgpt",{method:"DELETE",headers:{Authorization:"Bearer "+token}});if(!res.ok)throw new Error();await refresh();}catch{setError("Unable to disconnect. Retry.");}finally{setBusy(false);}}
  return <section id="chatgpt" className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
    <h2 className="font-semibold text-white">ChatGPT plan</h2>
    <p className="mt-1 text-xs leading-5 text-zinc-400">Connect your ChatGPT plan to use its available models in Cryzo. Usage counts toward your ChatGPT limits.</p>
    <p role="status" className="mt-3 text-xs text-zinc-400">{status?.connected ? "Connected"+(status.email?" · "+status.email:"") : status?.reason || (status?.enabled ? "Not connected" : "Checking availability…")}</p>
    {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    <div className="mt-4 flex gap-3"><button type="button" disabled={!status?.enabled || busy} onClick={()=>void connect()} className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-40">{busy&&<Loader2 size={14} className="animate-spin"/>}{status?.connected?"Reconnect ChatGPT":"Continue with ChatGPT"}</button>
    {status?.connected&&<button type="button" disabled={busy} onClick={()=>void disconnect()} className="text-xs text-zinc-400">Disconnect</button>}</div>
  </section>;
}
