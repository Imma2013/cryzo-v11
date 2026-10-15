"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BarChart3, Bot, CalendarDays, Plus, Settings2, Trash2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SocialNetworkLogo, type SocialNetwork } from "@/components/SocialNetworkLogo";
import ProjectSocialAccounts from "./ProjectSocialAccounts";
import MarketingAIChat from "./MarketingAIChat";
import MarketingAnalytics from "./MarketingAnalytics";
import MarketingCalendar, { type MarketingPost } from "./MarketingCalendar";
import MarketingComposer from "./MarketingComposer";

type SocialAccount = {
  _id: Id<"socialAccounts">;
  channel: SocialNetwork;
  connectedAccountId: string;
  name: string;
};

type Post = MarketingPost & {
  _id: Id<"socialPosts">;
  deliveries?: Array<{ channel: string; status: string; error?: string }>;
};

const NAV = [
  { id: "ai", label: "AI", icon: Bot },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

const CONTENT_TABS = [
  { id: "calendar", label: "Calendar" },
  { id: "analytics", label: "Analytics" },
] as const;

export default function ProjectMarketingV3() {
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(api.social.getAccess, { now: accessNow });
  const posts = useQuery(api.social.listPosts, {}) as Post[] | undefined;
  const accounts = useQuery(api.social.listAccounts, {}) as SocialAccount[] | undefined;
  const reschedulePost = useMutation(api.social.reschedulePost);
  const removePost = useMutation(api.social.removePost);

  const [surface, setSurface] = useState<(typeof NAV)[number]["id"]>("calendar");
  const [selectedChannel, setSelectedChannel] = useState<SocialNetwork | null>(null);
  const [manageAccounts, setManageAccounts] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState(() => new Date());
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [actionError, setActionError] = useState("");

  const activeAccounts = useMemo(
    () => (accounts || []).filter((account) => ["x", "facebook", "instagram", "youtube", "linkedin", "tiktok"].includes(account.channel)),
    [accounts],
  );
  const defaultChannels = selectedChannel ? [selectedChannel] : activeAccounts.length ? [activeAccounts[0].channel] : ["x"];
  const aiChannels = selectedChannel ? [selectedChannel] : [...new Set(activeAccounts.map((account) => account.channel))];

  function createAt(date: Date) {
    setComposerDate(date);
    setComposerOpen(true);
  }

  async function reschedule(postId: string, date: Date) {
    setActionError("");
    try {
      await reschedulePost({ postId: postId as Id<"socialPosts">, scheduledFor: date.getTime() });
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Unable to move post.");
    }
  }

  if (access === undefined || posts === undefined || accounts === undefined) {
    return <div className="flex h-full items-center justify-center bg-black text-sm text-zinc-600">Loading Marketing…</div>;
  }

  return (
    <div className="flex h-full min-h-0 bg-black text-white">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-zinc-800 bg-[#0b0b0b] md:flex">
        <div className="border-b border-zinc-800 px-4 py-5">
          <h1 className="text-lg font-semibold">Marketing</h1>
          <p className="mt-1 text-xs text-zinc-600">Plan, publish, and measure.</p>
        </div>

        <nav className="p-3">
          <button type="button" onClick={() => setSurface("ai")} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${surface === "ai" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-300"}`}>
            <Bot size={16} />
            AI
          </button>
        </nav>

        <div className="mx-4 border-t border-zinc-800" />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between px-2 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-700">Channels</p>
            <button type="button" onClick={() => setManageAccounts(true)} className="rounded-md p-1 text-zinc-600 hover:bg-zinc-900 hover:text-white" title="Manage channels"><Settings2 size={13} /></button>
          </div>
          <button type="button" onClick={() => { setSelectedChannel(null); setSurface("calendar"); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs ${selectedChannel === null ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-950"}`}>
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-900"><CalendarDays size={14} /></span>
            All channels
          </button>
          <div className="mt-1 space-y-1">
            {activeAccounts.map((account) => (
              <button key={account._id} type="button" onClick={() => { setSelectedChannel(account.channel); setSurface("calendar"); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${selectedChannel === account.channel ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-300"}`}>
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-black"><SocialNetworkLogo channel={account.channel} size={15} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{account.name}</span><span className="block text-[9px] uppercase tracking-wider text-zinc-700">{account.channel}</span></span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setManageAccounts(true)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-zinc-600 hover:text-white"><Plus size={13} />Add channel</button>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-3 md:hidden">
          {NAV.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} type="button" onClick={() => setSurface(item.id)} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${surface === item.id ? "bg-white text-black" : "border border-zinc-800 text-zinc-400"}`}><Icon size={14} />{item.label}</button>;
          })}
          <button type="button" onClick={() => setManageAccounts(true)} className="ml-auto rounded-xl border border-zinc-800 p-2 text-zinc-400"><Settings2 size={15} /></button>
        </div>

        {surface !== "ai" && (
          <div className="hidden items-center gap-7 border-b border-zinc-800 bg-[#0b0b0b] px-5 md:flex">
            {CONTENT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSurface(tab.id)}
                className={`relative py-4 text-sm font-semibold transition ${surface === tab.id ? "text-white" : "text-zinc-500 hover:text-zinc-300"}`}
              >
                {tab.label}
                {surface === tab.id && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white" />}
              </button>
            ))}
          </div>
        )}

        <div className="min-h-0 flex-1">
          {surface === "ai" ? (
            <MarketingAIChat channels={aiChannels} />
          ) : surface === "analytics" ? (
            <MarketingAnalytics unlocked={Boolean(access.canSchedule || access.isAdmin)} channel={selectedChannel} />
          ) : (
            <MarketingCalendar
              posts={posts as unknown as MarketingPost[]}
              selectedChannel={selectedChannel}
              onCreate={createAt}
              onOpenPost={(post) => setSelectedPost(post as Post)}
              onReschedule={reschedule}
            />
          )}
        </div>
        {actionError && <div className="border-t border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-300">{actionError}</div>}
      </main>

      <MarketingComposer
        open={composerOpen}
        initialDate={composerDate}
        defaultChannels={defaultChannels}
        accounts={activeAccounts}
        canSchedule={Boolean(access.canSchedule || access.isAdmin)}
        onClose={() => setComposerOpen(false)}
      />

      {manageAccounts && (
        <div className="fixed inset-0 z-[95] overflow-y-auto bg-black/85 p-3 sm:p-8" onMouseDown={() => setManageAccounts(false)}>
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-zinc-800 bg-[#0b0b0b]" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div><h2 className="text-lg font-semibold">Channels</h2><p className="mt-1 text-xs text-zinc-600">Connect the accounts used by Calendar, AI, and Analytics.</p></div><button type="button" onClick={() => setManageAccounts(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"><X size={18} /></button></div>
            <ProjectSocialAccounts />
          </div>
        </div>
      )}

      {selectedPost && (
        <div className="fixed inset-0 z-[94] flex justify-end bg-black/70" onMouseDown={() => setSelectedPost(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#111] p-5" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Post details</p><h2 className="mt-1 text-base font-semibold">{new Date(selectedPost.scheduledFor).toLocaleString()}</h2></div><button type="button" onClick={() => setSelectedPost(null)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900"><X size={18} /></button></div>
            <div className="mt-5 flex flex-wrap gap-2">{selectedPost.channels.map((channel) => <span key={channel} className="inline-flex items-center gap-2 rounded-full border border-zinc-800 px-3 py-1.5 text-xs"><SocialNetworkLogo channel={channel} size={13} />{channel}</span>)}</div>
            <p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-zinc-300">{selectedPost.content}</p>
            <p className="mt-4 text-xs uppercase tracking-widest text-zinc-600">{selectedPost.status}</p>
            {selectedPost.deliveries?.length ? <div className="mt-4 space-y-2">{selectedPost.deliveries.map((delivery, index) => <div key={index} className="rounded-xl border border-zinc-800 bg-black/30 p-3"><div className="flex items-center justify-between"><span className="text-xs font-semibold">{delivery.channel}</span><span className="text-[10px] uppercase text-zinc-500">{delivery.status}</span></div>{delivery.error && <p className="mt-2 text-xs text-red-300">{delivery.error}</p>}</div>)}</div> : null}
            {!["publishing", "published"].includes(selectedPost.status) && <button type="button" onClick={() => void removePost({ postId: selectedPost._id }).then(() => setSelectedPost(null))} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-red-400"><Trash2 size={14} />Delete post</button>}
          </aside>
        </div>
      )}
    </div>
  );
}
