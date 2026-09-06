"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MessageSquare,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import ProjectSocialAccounts from "./ProjectSocialAccounts";
import SocialPostPreview from "./SocialPostPreview";

const CHANNELS = [
  { id: "x", label: "X", color: "bg-white text-black" },
  { id: "linkedin", label: "LinkedIn", color: "bg-[#0a66c2] text-white" },
  { id: "reddit", label: "Reddit", color: "bg-[#ff4500] text-white" },
  { id: "youtube", label: "YouTube", color: "bg-[#ff0033] text-white" },
  { id: "tiktok", label: "TikTok", color: "bg-zinc-950 text-white" },
  { id: "instagram", label: "Instagram", color: "bg-[#d62976] text-white" },
  { id: "facebook", label: "Facebook", color: "bg-[#1877f2] text-white" },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];
type DeliveryStatus = "draft" | "scheduled" | "pending" | "publishing" | "published" | "failed" | "unknown";
type SocialDelivery = { _id?: Id<"socialDeliveries">; channel: ChannelId; status: DeliveryStatus; error?: string };
type SocialAccount = { _id: Id<"socialAccounts">; channel: ChannelId; connectedAccountId: string; name: string };
type SocialPost = {
  _id: Id<"socialPosts">;
  content: string;
  channels: ChannelId[];
  scheduledFor: number;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  deliveries?: SocialDelivery[];
  mediaUrls?: string[];
};
type PublishingTarget = { id: string; name: string; username?: string };
type AgentMessage = { role: "user" | "assistant"; content: string };

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function monthDays(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function channelLabel(id: ChannelId) {
  return CHANNELS.find((channel) => channel.id === id)?.label || id;
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-500/15 text-emerald-300";
  if (status === "failed" || status === "unknown") return "bg-red-500/15 text-red-300";
  if (status === "scheduled") return "bg-sky-500/15 text-sky-300";
  return "bg-zinc-800 text-zinc-300";
}

function deliveryError(channel: ChannelId, error?: string) {
  if (!error) return "The network did not confirm this delivery.";
  if (channel === "x" && /credits depleted|payment required|credits-depleted|status["']?\s*:\s*402/i.test(error)) {
    return "X publishing is unavailable because the connected X developer app has no API credits. Add X API credits, then retry this network.";
  }
  if (error.trim().startsWith("{") || error.includes("api.x.com/2/problems")) {
    return "The social network rejected this delivery. Resolve the provider issue, then retry this network.";
  }
  return error;
}

function deliveriesForPost(post: SocialPost): SocialDelivery[] {
  return post.deliveries?.length ? post.deliveries : post.channels.map((channel) => ({ channel, status: post.status as DeliveryStatus }));
}

export default function ProjectMarketingV2() {
  const { authToken, userId } = useAuth();
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(api.social.getAccess, { now: accessNow });
  const posts = useQuery(api.social.listPosts, {}) as SocialPost[] | undefined;
  const socialAccounts = useQuery(api.social.listAccounts, {}) as SocialAccount[] | undefined;
  const projects = useQuery(api.conversations.list, userId ? { userId } : "skip");
  const createPost = useMutation(api.social.createPost);
  const publishNow = useMutation(api.social.publishNow);
  const retryDelivery = useMutation(api.social.retryDelivery);
  const removePost = useMutation(api.social.removePost);

  const [mobilePane, setMobilePane] = useState<"calendar" | "chat">("calendar");
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [mobileDay, setMobileDay] = useState(() => new Date());
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [content, setContent] = useState("");
  const [channels, setChannels] = useState<ChannelId[]>(["x"]);
  const [scheduledFor, setScheduledFor] = useState(() => localInputValue(new Date(Date.now() + 3_600_000)));
  const [mediaStorageIds, setMediaStorageIds] = useState<string[]>([]);
  const [mediaNames, setMediaNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [accountSelections, setAccountSelections] = useState<Partial<Record<ChannelId, string>>>({});
  const [redditCommunity, setRedditCommunity] = useState("");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
  const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
  const [linkedinAuthorUrn, setLinkedinAuthorUrn] = useState("");
  const [linkedinVisibility, setLinkedinVisibility] = useState("PUBLIC");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [instagramUserId, setInstagramUserId] = useState("");
  const [instagramPostType, setInstagramPostType] = useState<"post" | "reel" | "story" | "carousel">("post");
  const [facebookPages, setFacebookPages] = useState<PublishingTarget[]>([]);
  const [instagramTargets, setInstagramTargets] = useState<PublishingTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [agentHistory, setAgentHistory] = useState<AgentMessage[]>([]);
  const activeProjectId = sourceProjectId || "";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cryzo-marketing-history-v1");
      if (stored) setAgentHistory(JSON.parse(stored) as AgentMessage[]);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem("cryzo-marketing-history-v1", JSON.stringify(agentHistory.slice(-30))); } catch {}
  }, [agentHistory]);
  useEffect(() => {
    if (!socialAccounts) return;
    setAccountSelections((current) => {
      const next = { ...current };
      for (const channel of CHANNELS) {
        const choices = socialAccounts.filter((account) => account.channel === channel.id);
        if (!next[channel.id] || !choices.some((account) => account.connectedAccountId === next[channel.id])) {
          next[channel.id] = choices[0]?.connectedAccountId;
        }
      }
      return next;
    });
  }, [socialAccounts]);
  useEffect(() => {
    if (!composerOpen || !authToken) return;
    const requested = (["facebook", "instagram"] as const).filter((channel) => channels.includes(channel));
    if (!requested.length) return;
    setTargetsLoading(true);
    void Promise.all(requested.map(async (channel) => {
      const accountId = accountSelections[channel];
      if (!accountId) return { channel, items: [] as PublishingTarget[] };
      const params = new URLSearchParams({ channel, accountId });
      const response = await fetch(`/api/social/targets?${params}`, { headers: { Authorization: `Bearer ${authToken}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${channel} destinations.`);
      return { channel, items: data.items as PublishingTarget[] };
    }))
      .then((results) => {
        for (const result of results) {
          if (result.channel === "facebook") {
            setFacebookPages(result.items);
            setFacebookPageId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id || "");
          } else {
            setInstagramTargets(result.items);
            setInstagramUserId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id || "");
          }
        }
      })
      .catch((error) => setComposerError(error instanceof Error ? error.message : "Could not load publishing destinations."))
      .finally(() => setTargetsLoading(false));
  }, [accountSelections.facebook, accountSelections.instagram, authToken, channels, composerOpen]);

  const week = useMemo(() => {
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [anchor]);
  const month = useMemo(() => monthDays(anchor), [anchor]);
  const postsForDay = (date: Date) => (posts || []).filter((post) => new Date(post.scheduledFor).toDateString() === date.toDateString());

  const generateDraft = async () => {
    if (!aiPrompt.trim() || !authToken || aiLoading) return;
    const prompt = aiPrompt.trim();
    setAiPrompt("");
    setAiLoading(true);
    setAiError(null);
    setAgentHistory((current) => [...current, { role: "user" as const, content: prompt }]);
    try {
      const response = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ prompt, channels, conversationId: activeProjectId || undefined, requestKey: crypto.randomUUID(), history: agentHistory }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate post");
      const text = String(data.text || "");
      setAiDraft(text);
      setAgentHistory((current) => [...current, { role: "assistant" as const, content: text }].slice(-30));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to generate post");
    } finally { setAiLoading(false); }
  };

  const uploadMedia = async (files: FileList | null) => {
    if (!files?.length || !authToken) return;
    setComposerError(null);
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - mediaStorageIds.length))) {
        if (file.size > 500_000_000) throw new Error("Use media below 500 MB.");
        const authorize = await fetch("/api/social/media", { method: "POST", headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const upload = await fetch(permission.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error("Upload failed.");
        const { storageId } = await upload.json();
        const register = await fetch("/api/social/media", { method: "POST", headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ storageId, contentType: file.type, name: file.name }) });
        const data = await register.json();
        if (!register.ok) throw new Error(data.error || "Upload registration failed.");
        setMediaStorageIds((current) => [...current, data.storageId]);
        setMediaNames((current) => [...current, file.name]);
      }
    } catch (error) { setComposerError(error instanceof Error ? error.message : "Media upload failed"); }
  };

  const toggleChannel = (id: ChannelId) => setChannels((current) => current.includes(id) ? current.filter((channel) => channel !== id) : access?.maxChannelsPerPost === 1 ? [id] : [...current, id]);

  const save = async (status: "draft" | "scheduled" | "now") => {
    if (saving) return;
    setSaving(true);
    setComposerError(null);
    try {
      const postId = await createPost({
        conversationId: activeProjectId ? (activeProjectId as Id<"conversations">) : undefined,
        requestKey: crypto.randomUUID(),
        content,
        channels,
        scheduledFor: status === "scheduled" ? new Date(scheduledFor).getTime() : Date.now(),
        status: status === "scheduled" ? "scheduled" : "draft",
        mediaStorageIds: mediaStorageIds as Id<"_storage">[],
        platformOptions: {
          redditCommunity: redditCommunity.trim() || undefined,
          youtubeTitle: youtubeTitle.trim() || undefined,
          youtubePrivacy,
          facebookPageId: facebookPageId.trim() || undefined,
          instagramUserId: instagramUserId.trim() || undefined,
          instagramPostType: channels.includes("instagram") ? instagramPostType : undefined,
          tiktokPrivacy: channels.includes("tiktok") ? tiktokPrivacy : undefined,
          linkedinAuthorUrn: channels.includes("linkedin") ? linkedinAuthorUrn.trim() || undefined : undefined,
          linkedinVisibility: channels.includes("linkedin") ? linkedinVisibility : undefined,
          accountSelections: channels.flatMap((channel) => accountSelections[channel] ? [{ channel, connectedAccountId: accountSelections[channel]! }] : []),
        },
      });
      if (status === "now") await publishNow({ postId });
      setComposerOpen(false);
      setContent("");
      setMediaStorageIds([]);
      setMediaNames([]);
    } catch (error) { setComposerError(error instanceof Error ? error.message : "Unable to save post"); }
    finally { setSaving(false); }
  };

  if (access === undefined || posts === undefined) return <div className="flex h-full items-center justify-center bg-[#090909] text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>;
  if (!access.allowed) return <div className="flex h-full items-center justify-center bg-[#0b0b0b] p-6 text-white"><div className="max-w-lg rounded-[28px] border border-[#ff5f2e]/30 bg-[#15110f] p-8 text-center"><CalendarDays className="mx-auto text-[#ff7550]" size={34} /><h1 className="mt-5 text-2xl font-semibold">Cryzo Social</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Plan campaigns, create posts with AI, and publish from one calendar.</p><Link href="/chat/billing" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Upgrade to Starter</Link></div></div>;

  const postCard = (post: SocialPost) => <button key={String(post._id)} type="button" onClick={() => setSelectedPost(post)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-left hover:border-zinc-600"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-semibold text-zinc-300">{post.channels.map(channelLabel).join(" · ")}</span><span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase ${statusClass(post.status)}`}>{post.status}</span></div><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-400">{post.content || "Untitled post"}</p></button>;

  const chatPanel = (mobile: boolean) => <section className={`min-h-0 flex-col bg-[#0d0d0d] ${mobile ? "flex h-full" : "hidden xl:flex xl:border-r xl:border-zinc-800"}`}><header className="border-b border-zinc-800 p-5"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-[#ff7550]" />Marketing copilot</div><p className="mt-1 text-xs text-zinc-500">A full chat for campaigns, rewrites, and distribution.</p></div>{mobile && <button type="button" onClick={() => setMobilePane("calendar")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold">Calendar</button>}</div>{projects && projects.length > 0 && <select value={activeProjectId} onChange={(event) => setSourceProjectId(event.target.value)} className="mt-4 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="">New chat (no project context)</option>{projects.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}</select>}</header><div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">{agentHistory.length === 0 ? <div className="flex h-full min-h-52 flex-col items-center justify-center text-center"><MessageSquare size={28} className="text-zinc-700" /><p className="mt-3 text-sm font-medium text-zinc-300">Start a campaign conversation</p><p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">Ask Cryzo to draft, rewrite, or adapt a post for your connected networks.</p></div> : agentHistory.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-white text-black" : "mr-auto border border-zinc-800 bg-[#171717] text-zinc-200"}`}><p className="whitespace-pre-wrap">{message.content}</p></div>)}{aiLoading && <div className="mr-auto flex items-center gap-2 rounded-2xl border border-zinc-800 bg-[#171717] px-4 py-3 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" />Writing…</div>}{aiError && <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{aiError}</p>}</div><footer className="border-t border-zinc-800 p-4"><div className="rounded-2xl border border-zinc-700 bg-black p-3 focus-within:border-[#ff7550]"><textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void generateDraft(); } }} placeholder="Ask Cryzo to write or adapt a post…" className="min-h-24 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600" /><div className="mt-2 flex justify-end"><button type="button" disabled={!aiPrompt.trim() || aiLoading} onClick={() => void generateDraft()} className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Send</button></div></div>{aiDraft && <button type="button" onClick={() => { setContent(aiDraft); setPublishMode("now"); setComposerOpen(true); }} className="mt-2 w-full rounded-xl border border-[#ff7550]/30 bg-[#ff7550]/10 px-3 py-2 text-xs font-semibold text-[#ff9b7e]">Use latest draft in composer</button>}</footer></section>;

  const weekTitle = `${week[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return <div className="h-full min-h-0 bg-[#090909] text-white">
    <div className="hidden h-full min-h-0 xl:grid xl:grid-cols-[minmax(420px,480px)_minmax(0,1fr)]">{chatPanel(false)}<main className="flex min-h-0 flex-col overflow-hidden"><header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4"><div><h1 className="text-xl font-semibold">Marketing</h1><p className="mt-1 text-xs text-zinc-500">Plan, publish, and review delivery from one workspace.</p></div><button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">Create post</button></header><ProjectSocialAccounts /><div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setAnchor(new Date())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Today</button><button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - (calendarView === "week" ? 7 : 30)))} className="p-2 text-zinc-500"><ChevronLeft size={18} /></button><button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + (calendarView === "week" ? 7 : 30)))} className="p-2 text-zinc-500"><ChevronRight size={18} /></button><span className="ml-1 text-sm font-semibold">{calendarView === "week" ? weekTitle : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span></div><div className="flex rounded-xl border border-zinc-800 p-1">{(["week", "month"] as const).map((view) => <button key={view} type="button" onClick={() => setCalendarView(view)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${calendarView === view ? "bg-white text-black" : "text-zinc-500"}`}>{view}</button>)}</div></div><div className="min-h-0 flex-1 overflow-auto p-4">{calendarView === "week" ? <div className="grid min-w-[980px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">{week.map((day) => <section key={day.toISOString()} className="min-h-[520px] border-r border-zinc-800 bg-[#0d0d0d] last:border-r-0"><div className={`border-b border-zinc-800 p-3 ${day.toDateString() === new Date().toDateString() ? "bg-[#ff5f2e]/10" : ""}`}><p className="text-[10px] uppercase tracking-widest text-zinc-600">{day.toLocaleDateString(undefined, { weekday: "short" })}</p><p className="mt-1 text-lg font-semibold">{day.getDate()}</p></div><div className="space-y-2 p-2">{postsForDay(day).map(postCard)}</div></section>)}</div> : <div className="grid min-w-[920px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">{month.map((day) => <section key={day.toISOString()} className={`min-h-[150px] border-b border-r border-zinc-800 p-2 ${day.getMonth() === anchor.getMonth() ? "bg-[#0d0d0d]" : "bg-black/20 opacity-50"}`}><p className="mb-2 text-xs font-semibold text-zinc-500">{day.getDate()}</p><div className="space-y-1.5">{postsForDay(day).slice(0, 3).map(postCard)}</div></section>)}</div>}</div></main></div>
    <div className="flex h-full min-h-0 flex-col xl:hidden">{mobilePane === "chat" ? chatPanel(true) : <main className="flex h-full min-h-0 flex-col overflow-hidden"><header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><div><h1 className="text-base font-semibold">Marketing</h1><p className="text-[10px] text-zinc-600">Calendar</p></div><div className="flex gap-2"><button type="button" onClick={() => setMobilePane("chat")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold"><MessageSquare size={14} className="mr-1 inline" />Chat</button><button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">Create</button></div></header><ProjectSocialAccounts /><div className="border-b border-zinc-800 px-3 py-3"><div className="flex items-center justify-between"><button type="button" onClick={() => { const next = new Date(mobileDay); next.setDate(next.getDate() - 7); setMobileDay(next); }} className="p-2 text-zinc-500"><ChevronLeft size={18} /></button><p className="text-sm font-semibold">{startOfWeek(mobileDay).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p><button type="button" onClick={() => { const next = new Date(mobileDay); next.setDate(next.getDate() + 7); setMobileDay(next); }} className="p-2 text-zinc-500"><ChevronRight size={18} /></button></div><div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, index) => { const day = new Date(startOfWeek(mobileDay)); day.setDate(day.getDate() + index); const active = day.toDateString() === mobileDay.toDateString(); return <button key={day.toISOString()} type="button" onClick={() => setMobileDay(day)} className={`rounded-xl px-1 py-2 text-center ${active ? "bg-white text-black" : "bg-zinc-950 text-zinc-400"}`}><span className="block text-[9px] uppercase">{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span><span className="mt-1 block text-sm font-semibold">{day.getDate()}</span></button>; })}</div></div><div className="min-h-0 flex-1 overflow-y-auto p-4"><h2 className="text-sm font-semibold">{mobileDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2><div className="mt-3 space-y-3">{postsForDay(mobileDay).length ? postsForDay(mobileDay).map(postCard) : <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-600">No posts scheduled for this day.</div>}</div></div></main>}</div>
    {selectedPost && <div className="fixed inset-0 z-[80] flex justify-end bg-black/65" onClick={() => setSelectedPost(null)}><aside className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#111] p-5" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Post details</p><h2 className="mt-1 text-lg font-semibold">{new Date(selectedPost.scheduledFor).toLocaleString()}</h2></div><button type="button" onClick={() => setSelectedPost(null)} className="p-2 text-zinc-500"><X size={18} /></button></div><div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800"><SocialPostPreview channel={selectedPost.channels[0] || "x"} content={selectedPost.content} accountName={socialAccounts?.find((account) => account.channel === selectedPost.channels[0])?.name || "Your account"} media={(selectedPost.mediaUrls || []).map((url) => ({ url }))} /></div><div className="mt-5 space-y-3">{deliveriesForPost(selectedPost).map((delivery) => <div key={delivery._id ? String(delivery._id) : delivery.channel} className="rounded-2xl border border-zinc-800 bg-black/40 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{channelLabel(delivery.channel)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(delivery.status)}`}>{delivery.status}</span></div>{(delivery.status === "failed" || delivery.status === "unknown") && <p className="mt-3 text-xs leading-5 text-red-300">{deliveryError(delivery.channel, delivery.error)}</p>}{delivery.status === "failed" && delivery._id && <button type="button" onClick={() => void retryDelivery({ deliveryId: delivery._id! })} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"><RotateCcw size={12} />Retry this network</button>}</div>)}</div><button type="button" onClick={() => void removePost({ postId: selectedPost._id }).then(() => setSelectedPost(null))} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-red-400"><Trash2 size={13} />Delete post</button></aside></div>}
    {composerOpen && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3"><div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-zinc-700 bg-[#151515] p-5 sm:p-7"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Create post</h2><p className="mt-1 text-xs text-zinc-500">One idea, published everywhere you choose.</p></div><button type="button" onClick={() => setComposerOpen(false)} className="p-2 text-zinc-500"><X size={20} /></button></div><div className="mt-5 flex flex-wrap gap-2">{CHANNELS.map((channel) => { const active = channels.includes(channel.id); return <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? `${channel.color} border-transparent` : "border-zinc-700 text-zinc-500"}`}>{channel.label}</button>; })}</div><div className="mt-4 grid gap-3 sm:grid-cols-2">{channels.map((channel) => { const options = socialAccounts?.filter((account) => account.channel === channel) || []; return <label key={channel} className="text-xs text-zinc-400">{channelLabel(channel)} account<select value={accountSelections[channel] || ""} onChange={(event) => setAccountSelections((current) => ({ ...current, [channel]: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="">Choose account</option>{options.map((account) => <option key={account.connectedAccountId} value={account.connectedAccountId}>{account.name}</option>)}</select></label>; })}</div><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write something worth stopping for…" className="mt-5 min-h-48 w-full resize-none rounded-2xl border border-zinc-700 bg-black p-4 text-base leading-7 outline-none" /><label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400"><ImagePlus size={18} />Add images or videos<input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => void uploadMedia(event.target.files)} /></label>{mediaNames.length > 0 && <p className="mt-2 text-xs text-zinc-500">{mediaNames.join(", ")}</p>}{channels.includes("reddit") && <input value={redditCommunity} onChange={(event) => setRedditCommunity(event.target.value)} placeholder="Reddit community" className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm" />}{channels.includes("youtube") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} placeholder="YouTube title" className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm" /><select value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>}{channels.includes("facebook") && <select value={facebookPageId} disabled={targetsLoading} onChange={(event) => setFacebookPageId(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="">Choose Facebook Page</option>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select>}{channels.includes("instagram") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><select value={instagramUserId} disabled={targetsLoading} onChange={(event) => setInstagramUserId(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="">Choose Instagram profile</option>{instagramTargets.map((target) => <option key={target.id} value={target.id}>{target.username ? `@${target.username}` : target.name}</option>)}</select><select value={instagramPostType} onChange={(event) => setInstagramPostType(event.target.value as "post" | "reel" | "story" | "carousel")} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="post">Image post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>}{channels.includes("linkedin") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={linkedinAuthorUrn} onChange={(event) => setLinkedinAuthorUrn(event.target.value)} placeholder="LinkedIn author URN (optional)" className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm" /><select value={linkedinVisibility} onChange={(event) => setLinkedinVisibility(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="PUBLIC">Public</option><option value="CONNECTIONS">Connections</option><option value="LOGGED_IN">LinkedIn members</option></select></div>}{channels.includes("tiktok") && <select value={tiktokPrivacy} onChange={(event) => setTiktokPrivacy(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="SELF_ONLY">Only me</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="PUBLIC_TO_EVERYONE">Public</option></select>}<div className="mt-5 rounded-2xl border border-zinc-800 bg-black/40 p-4"><div className="flex gap-3"><button type="button" onClick={() => setPublishMode("now")} className={`rounded-xl px-3 py-2 text-xs ${publishMode === "now" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Publish now</button><button type="button" onClick={() => setPublishMode("scheduled")} className={`rounded-xl px-3 py-2 text-xs ${publishMode === "scheduled" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Schedule</button></div>{publishMode === "scheduled" && <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm" />}</div>{composerError && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{composerError}</p>}<div className="mt-6 flex items-center justify-between"><button type="button" disabled={saving} onClick={() => void save("draft")} className="text-xs font-semibold text-zinc-400">Save as draft</button><button type="button" disabled={saving || !content.trim() || !channels.length} onClick={() => void save(publishMode === "scheduled" ? "scheduled" : "now")} className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : publishMode === "scheduled" ? "Schedule" : `Publish (${channels.length})`}</button></div></div></div>}
  </div>;
}
