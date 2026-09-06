"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImagePlus,
  Loader2,
  MessageSquare,
  Plus,
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
type SocialDelivery = {
  _id?: Id<"socialDeliveries">;
  channel: ChannelId;
  status: DeliveryStatus;
  error?: string;
  remoteUrl?: string;
  toolSlug?: string;
  providerLogId?: string;
};
type SocialAccount = {
  _id: Id<"socialAccounts">;
  channel: ChannelId;
  connectedAccountId: string;
  name: string;
};
type SocialPost = {
  _id: Id<"socialPosts">;
  content: string;
  channels: ChannelId[];
  scheduledFor: number;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  error?: string;
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

function monthGrid(date: Date) {
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

function friendlyDeliveryError(channel: ChannelId, value?: string) {
  if (!value) return "The network did not confirm this post.";
  if (
    channel === "x" &&
    /credits depleted|payment required|status["']?\s*:\s*402|credits-depleted/i.test(value)
  ) {
    return "X publishing is unavailable because the connected X developer app has no API credits. Add X API credits, then retry this network.";
  }
  if (/cryzo['’]s composio delivery credits are depleted/i.test(value)) {
    return "The connected provider has no delivery credits available. Refill the provider balance, then retry this network.";
  }
  if (value.trim().startsWith("{") || value.includes("https://api.x.com/2/problems/")) {
    return "The social network rejected this delivery. Open details or retry after the provider issue is resolved.";
  }
  return value;
}

function statusTone(status: string) {
  if (status === "published") return "bg-emerald-500/15 text-emerald-300";
  if (status === "failed" || status === "unknown") return "bg-red-500/15 text-red-300";
  if (status === "scheduled") return "bg-sky-500/15 text-sky-300";
  return "bg-zinc-800 text-zinc-300";
}

function channelLabel(id: ChannelId) {
  return CHANNELS.find((item) => item.id === id)?.label || id;
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

  const requestKey = useRef(crypto.randomUUID());
  const aiMediaInputRef = useRef<HTMLInputElement>(null);
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [mobilePane, setMobilePane] = useState<"calendar" | "chat">("calendar");
  const [anchor, setAnchor] = useState(() => new Date());
  const [mobileDay, setMobileDay] = useState(() => new Date());
  const [selectedPost, setSelectedPost] = useState<SocialPost | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [content, setContent] = useState("");
  const [channels, setChannels] = useState<ChannelId[]>(["x"]);
  const [scheduledFor, setScheduledFor] = useState(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(0, 0, 0);
    return localInputValue(next);
  });
  const [mediaStorageIds, setMediaStorageIds] = useState<string[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<{ url: string; type: string }[]>([]);
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
  const [targetsError, setTargetsError] = useState("");

  const [sourceProjectId, setSourceProjectId] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [agentHistory, setAgentHistory] = useState<AgentMessage[]>([]);

  const activeProjectId = sourceProjectId || "";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cryzo-marketing-history-v1");
      if (stored) setAgentHistory(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("cryzo-marketing-history-v1", JSON.stringify(agentHistory.slice(-30)));
    } catch {}
  }, [agentHistory]);

  useEffect(() => {
    if (!socialAccounts) return;
    setAccountSelections((current) => {
      const next = { ...current };
      let changed = false;
      for (const channel of CHANNELS) {
        const options = socialAccounts.filter((account) => account.channel === channel.id);
        if (!next[channel.id] || !options.some((account) => account.connectedAccountId === next[channel.id])) {
          const fallback = options[0]?.connectedAccountId;
          if (next[channel.id] !== fallback) {
            next[channel.id] = fallback;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [socialAccounts]);

  useEffect(() => {
    if (!composerOpen || !authToken) return;
    const lookups = (["facebook", "instagram"] as const)
      .filter((channel) => channels.includes(channel))
      .map(async (channel) => {
        const accountId = accountSelections[channel];
        if (!accountId) return { channel, items: [] as PublishingTarget[] };
        const params = new URLSearchParams({ channel, accountId });
        const response = await fetch(`/api/social/targets?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not load ${channel} destinations.`);
        return { channel, items: data.items as PublishingTarget[] };
      });
    if (!lookups.length) return;
    let cancelled = false;
    setTargetsLoading(true);
    setTargetsError("");
    void Promise.all(lookups)
      .then((results) => {
        if (cancelled) return;
        for (const result of results) {
          if (result.channel === "facebook") {
            setFacebookPages(result.items);
            setFacebookPageId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? "");
          } else {
            setInstagramTargets(result.items);
            setInstagramUserId((current) => result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? "");
          }
        }
      })
      .catch((error) => !cancelled && setTargetsError(error instanceof Error ? error.message : "Could not load publishing destinations."))
      .finally(() => !cancelled && setTargetsLoading(false));
    return () => { cancelled = true; };
  }, [accountSelections.facebook, accountSelections.instagram, authToken, channels, composerOpen]);

  const week = useMemo(() => {
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(first);
      day.setDate(first.getDate() + index);
      return day;
    });
  }, [anchor]);
  const month = useMemo(() => monthGrid(anchor), [anchor]);

  const postsForDay = (date: Date) => (posts || []).filter((post) => new Date(post.scheduledFor).toDateString() === date.toDateString());

  const uploadMedia = async (files: FileList | null, surface: "composer" | "agent" = "composer") => {
    if (!files?.length || !authToken) return;
    surface === "agent" ? setAiError(null) : setComposerError(null);
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - mediaStorageIds.length))) {
        if (file.size > 500_000_000) throw new Error("Use media below 500 MB.");
        const authorize = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const upload = await fetch(permission.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error("Upload failed.");
        const { storageId } = await upload.json();
        const register = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storageId, contentType: file.type, name: file.name }),
        });
        const data = await register.json();
        if (!register.ok) throw new Error(data.error || "Upload registration failed.");
        setMediaStorageIds((current) => [...current, data.storageId]);
        setMediaPreviews((current) => [...current, { url: data.url, type: file.type }]);
        setMediaNames((current) => [...current, file.name]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media upload failed";
      surface === "agent" ? setAiError(message) : setComposerError(message);
    }
  };

  const removeMedia = (index: number) => {
    setMediaStorageIds((current) => current.filter((_, i) => i !== index));
    setMediaPreviews((current) => current.filter((_, i) => i !== index));
    setMediaNames((current) => current.filter((_, i) => i !== index));
  };

  const generateDraft = async () => {
    if (!aiPrompt.trim() || !authToken || aiLoading) return;
    const prompt = aiPrompt.trim();
    setAiLoading(true);
    setAiError(null);
    setAgentHistory((current) => [...current, { role: "user", content: prompt }]);
    setAiPrompt("");
    try {
      const response = await fetch("/api/social/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          prompt,
          channels,
          conversationId: activeProjectId || undefined,
          requestKey: crypto.randomUUID(),
          history: agentHistory,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate post");
      const text = String(data.text || "");
      setAiDraft(text);
      setAiModel((data.fallbackUsed ? "Fallback: " : "") + (data.actualModel || ""));
      setAgentHistory((current) => [...current, { role: "assistant", content: text }].slice(-30));
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to generate post");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleChannel = (id: ChannelId) => {
    setChannels((current) => current.includes(id)
      ? current.filter((channel) => channel !== id)
      : access?.maxChannelsPerPost === 1 ? [id] : [...current, id]);
  };

  const save = async (status: "draft" | "scheduled" | "now") => {
    if (saving) return;
    setSaving(true);
    setComposerError(null);
    try {
      const postId = await createPost({
        conversationId: activeProjectId ? (activeProjectId as Id<"conversations">) : undefined,
        requestKey: requestKey.current,
        content,
        channels,
        scheduledFor: status === "scheduled" ? new Date(scheduledFor).getTime() : Date.now(),
        status: status === "scheduled" ? "scheduled" : "draft",
        mediaStorageIds: mediaStorageIds as Id<"_storage">[],
        platformOptions: {
          redditCommunity: redditCommunity.trim() || undefined,
          youtubeTitle: youtubeTitle.trim() || undefined,
          facebookPageId: facebookPageId.trim() || undefined,
          instagramUserId: instagramUserId.trim() || undefined,
          instagramPostType: channels.includes("instagram") ? instagramPostType : undefined,
          accountSelections: channels.flatMap((channel) => {
            const connectedAccountId = accountSelections[channel];
            return connectedAccountId ? [{ channel, connectedAccountId }] : [];
          }),
          youtubePrivacy,
          tiktokPrivacy: channels.includes("tiktok") ? tiktokPrivacy : undefined,
          linkedinAuthorUrn: channels.includes("linkedin") ? linkedinAuthorUrn.trim() || undefined : undefined,
          linkedinVisibility: channels.includes("linkedin") ? linkedinVisibility : undefined,
        },
      });
      if (status === "now") await publishNow({ postId });
      requestKey.current = crypto.randomUUID();
      setComposerOpen(false);
      setContent("");
      setMediaStorageIds([]);
      setMediaPreviews([]);
      setMediaNames([]);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to save post");
    } finally {
      setSaving(false);
    }
  };

  if (access === undefined || posts === undefined) {
    return <div className="flex h-full items-center justify-center bg-[#090909] text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>;
  }

  if (!access.allowed) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0b0b0b] p-6">
        <div className="max-w-lg rounded-[28px] border border-[#ff5f2e]/30 bg-[#15110f] p-8 text-center">
          <CalendarDays className="mx-auto text-[#ff7550]" size={34} />
          <h1 className="mt-5 text-2xl font-semibold text-white">Cryzo Social</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Plan campaigns, create posts with AI, and publish from one calendar.</p>
          <Link href="/chat/billing" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">Upgrade to Starter</Link>
        </div>
      </div>
    );
  }

  const PostPill = ({ post }: { post: SocialPost }) => (
    <button
      type="button"
      onClick={() => setSelectedPost(post)}
      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2 text-left transition hover:border-zinc-600"
    >
      <div className="flex items-start gap-2">
        {post.mediaUrls?.[0] ? <img src={post.mediaUrls[0]} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" /> : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-zinc-300">{post.channels.map(channelLabel).join(" · ")}</span>
            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase ${statusTone(post.status)}`}>{post.status}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-400">{post.content || "Untitled post"}</p>
        </div>
      </div>
    </button>
  );

  const ChatPanel = ({ mobile = false }: { mobile?: boolean }) => (
    <section className={`${mobile ? "flex h-full" : "hidden xl:flex"} min-h-0 flex-col border-zinc-800 bg-[#0d0d0d] xl:border-r`}>
      <div className="border-b border-zinc-800 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles size={16} className="text-[#ff7550]" /> Marketing copilot</div>
            <p className="mt-1 text-xs text-zinc-500">Draft, adapt, and plan posts with project context.</p>
          </div>
          {mobile && <button type="button" onClick={() => setMobilePane("calendar")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-white">Calendar</button>}
        </div>
        {projects && projects.length > 0 && (
          <select value={activeProjectId} onChange={(event) => setSourceProjectId(event.target.value)} className="mt-4 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs text-white outline-none">
            <option value="">New chat (no project context)</option>
            {projects.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}
          </select>
        )}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {agentHistory.length === 0 ? (
          <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
            <MessageSquare size={28} className="text-zinc-700" />
            <p className="mt-3 text-sm font-medium text-zinc-300">Start a campaign conversation</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">Ask for a launch thread, repurpose a post, or draft platform-specific copy.</p>
          </div>
        ) : agentHistory.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-white text-black" : "mr-auto border border-zinc-800 bg-[#171717] text-zinc-200"}`}>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
        {aiLoading && <div className="mr-auto flex items-center gap-2 rounded-2xl border border-zinc-800 bg-[#171717] px-4 py-3 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" /> Writing…</div>}
        {aiError && <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs leading-5 text-red-300">{aiError}</p>}
      </div>
      <div className="border-t border-zinc-800 p-4">
        {mediaNames.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{mediaNames.map((name, index) => <button key={`${name}-${index}`} onClick={() => removeMedia(index)} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">{name} ×</button>)}</div>}
        <div className="rounded-2xl border border-zinc-700 bg-black p-3 focus-within:border-[#ff7550]">
          <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void generateDraft(); } }} placeholder="Ask Cryzo to write or adapt a post…" className="min-h-24 w-full resize-none bg-transparent text-sm text-white outline-none placeholder:text-zinc-600" />
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <input ref={aiMediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { void uploadMedia(event.target.files, "agent"); event.currentTarget.value = ""; }} />
              <button type="button" onClick={() => aiMediaInputRef.current?.click()} className="grid h-9 w-9 place-items-center rounded-full border border-zinc-700 text-zinc-400 hover:text-white"><Plus size={16} /></button>
              {aiModel && <span className="text-[10px] text-zinc-600">{aiModel}</span>}
            </div>
            <button type="button" disabled={!aiPrompt.trim() || aiLoading} onClick={() => void generateDraft()} className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40">Send</button>
          </div>
        </div>
        {aiDraft && <button type="button" onClick={() => { setContent(aiDraft); setPublishMode("now"); setComposerOpen(true); }} className="mt-2 w-full rounded-xl border border-[#ff7550]/30 bg-[#ff7550]/10 px-3 py-2 text-xs font-semibold text-[#ff9b7e]">Use latest draft in composer</button>}
      </div>
    </section>
  );

  const CalendarHeader = () => (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { setAnchor(new Date()); setMobileDay(new Date()); }} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs font-semibold text-white">Today</button>
        <button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - (calendarView === "week" ? 7 : 30)))} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900"><ChevronLeft size={18} /></button>
        <button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + (calendarView === "week" ? 7 : 30)))} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900"><ChevronRight size={18} /></button>
        <h2 className="ml-1 text-sm font-semibold text-white sm:text-base">{calendarView === "week" ? `${week[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden rounded-xl border border-zinc-800 p-1 sm:flex">
          {(["week", "month"] as const).map((view) => <button key={view} type="button" onClick={() => setCalendarView(view)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${calendarView === view ? "bg-white text-black" : "text-zinc-500"}`}>{view}</button>)}
        </div>
        <button type="button" onClick={() => { setPublishMode("now"); setComposerOpen(true); }} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">Create post</button>
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 bg-[#090909] text-white">
      <div className="hidden h-full min-h-0 xl:grid xl:grid-cols-[minmax(420px,480px)_minmax(0,1fr)]">
        <ChatPanel />
        <main className="flex min-h-0 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div><h1 className="text-xl font-semibold">Marketing</h1><p className="mt-1 text-xs text-zinc-500">Plan, publish, and review delivery from one workspace.</p></div>
            <Link href="#social-accounts" className="rounded-xl border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-300">Connections</Link>
          </header>
          <ProjectSocialAccounts />
          <div className="px-5 py-2 text-xs text-zinc-500">{posts.filter((post) => post.status === "published").length} published · {posts.filter((post) => post.status === "scheduled").length} scheduled · {posts.filter((post) => post.status === "failed").length} need attention</div>
          <CalendarHeader />
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {calendarView === "week" ? (
              <div className="grid min-w-[980px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">
                {week.map((day) => <section key={day.toISOString()} className="min-h-[520px] border-r border-zinc-800 bg-[#0d0d0d] last:border-r-0"><div className={`border-b border-zinc-800 p-3 ${day.toDateString() === new Date().toDateString() ? "bg-[#ff5f2e]/10" : ""}`}><p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">{day.toLocaleDateString(undefined, { weekday: "short" })}</p><p className="mt-1 text-lg font-semibold">{day.getDate()}</p></div><div className="space-y-2 p-2">{postsForDay(day).map((post) => <PostPill key={post._id} post={post} />)}</div></section>)}
              </div>
            ) : (
              <div className="grid min-w-[920px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">
                {month.map((day) => <section key={day.toISOString()} className={`min-h-[150px] border-b border-r border-zinc-800 p-2 ${day.getMonth() !== anchor.getMonth() ? "bg-black/20 opacity-45" : "bg-[#0d0d0d]"}`}><p className={`mb-2 text-xs font-semibold ${day.toDateString() === new Date().toDateString() ? "text-[#ff7550]" : "text-zinc-500"}`}>{day.getDate()}</p><div className="space-y-1.5">{postsForDay(day).slice(0, 3).map((post) => <PostPill key={post._id} post={post} />)}{postsForDay(day).length > 3 && <p className="px-1 text-[10px] text-zinc-600">+{postsForDay(day).length - 3} more</p>}</div></section>)}
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="flex h-full min-h-0 flex-col xl:hidden">
        {mobilePane === "chat" ? <ChatPanel mobile /> : (
          <main className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div><h1 className="text-base font-semibold">Marketing</h1><p className="text-[10px] text-zinc-600">Calendar</p></div>
              <div className="flex items-center gap-2"><button type="button" onClick={() => setMobilePane("chat")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold"><MessageSquare size={14} className="mr-1 inline" />Chat</button><button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">Create</button></div>
            </header>
            <ProjectSocialAccounts />
            <div className="border-b border-zinc-800 px-3 py-3">
              <div className="flex items-center justify-between"><button type="button" onClick={() => { const d = new Date(mobileDay); d.setDate(d.getDate() - 7); setMobileDay(d); }} className="p-2 text-zinc-500"><ChevronLeft size={18} /></button><p className="text-sm font-semibold">{startOfWeek(mobileDay).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p><button type="button" onClick={() => { const d = new Date(mobileDay); d.setDate(d.getDate() + 7); setMobileDay(d); }} className="p-2 text-zinc-500"><ChevronRight size={18} /></button></div>
              <div className="mt-2 grid grid-cols-7 gap-1">{Array.from({ length: 7 }, (_, index) => { const day = new Date(startOfWeek(mobileDay)); day.setDate(day.getDate() + index); const active = day.toDateString() === mobileDay.toDateString(); return <button key={day.toISOString()} type="button" onClick={() => setMobileDay(day)} className={`rounded-xl px-1 py-2 text-center ${active ? "bg-white text-black" : "bg-zinc-950 text-zinc-400"}`}><span className="block text-[9px] uppercase">{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span><span className="mt-1 block text-sm font-semibold">{day.getDate()}</span></button>; })}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold">{mobileDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
              <div className="mt-3 space-y-3">{postsForDay(mobileDay).length ? postsForDay(mobileDay).map((post) => <PostPill key={post._id} post={post} />) : <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-600">No posts scheduled for this day.</div>}</div>
            </div>
          </main>
        )}
      </div>

      {selectedPost && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/65" onClick={() => setSelectedPost(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#111] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Post details</p><h2 className="mt-1 text-lg font-semibold">{new Date(selectedPost.scheduledFor).toLocaleString()}</h2></div><button type="button" onClick={() => setSelectedPost(null)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-900"><X size={18} /></button></div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800"><SocialPostPreview channel={selectedPost.channels[0] || "x"} content={selectedPost.content} accountName={socialAccounts?.find((account) => account.channel === selectedPost.channels[0])?.name || "Your account"} media={(selectedPost.mediaUrls || []).map((url) => ({ url }))} /></div>
            <div className="mt-5 space-y-3">{(selectedPost.deliveries?.length ? selectedPost.deliveries : selectedPost.channels.map((channel) => ({ channel, status: selectedPost.status as DeliveryStatus }))).map((delivery) => <div key={delivery._id || delivery.channel} className="rounded-2xl border border-zinc-800 bg-black/40 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">{channelLabel(delivery.channel)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusTone(delivery.status)}`}>{delivery.status}</span></div>{(delivery.status === "failed" || delivery.status === "unknown") && <p className="mt-3 text-xs leading-5 text-red-300">{friendlyDeliveryError(delivery.channel, delivery.error)}</p>}{delivery.status === "failed" && delivery._id && <button type="button" onClick={() => void retryDelivery({ deliveryId: delivery._id! })} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white"><RotateCcw size={12} /> Retry this network</button>}</div>)}</div>
            <button type="button" onClick={() => void removePost({ postId: selectedPost._id }).then(() => setSelectedPost(null))} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-red-400"><Trash2 size={13} /> Delete post</button>
          </aside>
        </div>
      )}

      {composerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-zinc-700 bg-[#151515] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Create post</h2><p className="mt-1 text-xs text-zinc-500">One idea, adapted to every selected network.</p></div><button type="button" onClick={() => setComposerOpen(false)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-800"><X size={20} /></button></div>
            <div className="mt-5 flex flex-wrap gap-2">{CHANNELS.map((channel) => { const active = channels.includes(channel.id); return <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${active ? `${channel.color} border-transparent` : "border-zinc-700 text-zinc-500"}`}>{channel.label}</button>; })}</div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{channels.map((channel) => { const options = socialAccounts?.filter((account) => account.channel === channel) || []; return <label key={channel} className="text-xs text-zinc-400">{channelLabel(channel)} account<select value={accountSelections[channel] || ""} onChange={(event) => setAccountSelections((current) => ({ ...current, [channel]: event.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white"><option value="">Choose account</option>{options.map((account) => <option key={account.connectedAccountId} value={account.connectedAccountId}>{account.name}</option>)}</select></label>; })}</div>
            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write something worth stopping for…" className="mt-5 min-h-48 w-full resize-none rounded-2xl border border-zinc-700 bg-black p-4 text-base leading-7 outline-none focus:border-[#ff7550]" />
            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400"><ImagePlus size={18} /> Add images or videos<input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => void uploadMedia(event.target.files)} /></label>
            {mediaNames.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{mediaNames.map((name, index) => <button key={`${name}-${index}`} type="button" onClick={() => removeMedia(index)} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400">{name} ×</button>)}</div>}
            {channels.includes("reddit") && <input value={redditCommunity} onChange={(event) => setRedditCommunity(event.target.value)} placeholder="Reddit community, e.g. smallbusiness" className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm" />}
            {channels.includes("youtube") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} placeholder="YouTube title" className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm" /><select value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>}
            {channels.includes("facebook") && <select value={facebookPageId} disabled={targetsLoading} onChange={(event) => setFacebookPageId(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="">{targetsLoading ? "Loading Facebook Pages…" : "Choose Facebook Page"}</option>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select>}
            {channels.includes("instagram") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><select value={instagramUserId} disabled={targetsLoading} onChange={(event) => setInstagramUserId(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="">Choose Instagram profile</option>{instagramTargets.map((target) => <option key={target.id} value={target.id}>{target.username ? `@${target.username}` : target.name}</option>)}</select><select value={instagramPostType} onChange={(event) => setInstagramPostType(event.target.value as typeof instagramPostType)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="post">Image post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div>}
            {channels.includes("linkedin") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><input value={linkedinAuthorUrn} onChange={(event) => setLinkedinAuthorUrn(event.target.value)} placeholder="LinkedIn author URN (optional)" className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm" /><select value={linkedinVisibility} onChange={(event) => setLinkedinVisibility(event.target.value)} className="h-11 rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="PUBLIC">Public</option><option value="CONNECTIONS">Connections</option><option value="LOGGED_IN">LinkedIn members</option></select></div>}
            {channels.includes("tiktok") && <select value={tiktokPrivacy} onChange={(event) => setTiktokPrivacy(event.target.value)} className="mt-4 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm"><option value="SELF_ONLY">Only me</option><option value="MUTUAL_FOLLOW_FRIENDS">Friends</option><option value="PUBLIC_TO_EVERYONE">Public</option></select>}
            {targetsError && <p className="mt-3 text-xs text-red-400">{targetsError}</p>}
            <div className="mt-5 rounded-2xl border border-zinc-800 bg-black/40 p-4"><p className="text-xs font-semibold text-zinc-300">When do you want to publish?</p><div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => setPublishMode("now")} className={`rounded-xl px-3 py-2 text-xs ${publishMode === "now" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Publish now</button><button type="button" onClick={() => setPublishMode("scheduled")} className={`rounded-xl px-3 py-2 text-xs ${publishMode === "scheduled" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Schedule</button></div>{publishMode === "scheduled" && <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-3 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm" />}</div>
            {composerError && <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{composerError}</p>}
            <div className="mt-6 flex items-center justify-between gap-3"><button type="button" disabled={saving} onClick={() => void save("draft")} className="text-xs font-semibold text-zinc-400">Save as draft</button><button type="button" disabled={saving || !content.trim() || channels.length === 0} onClick={() => void save(publishMode === "scheduled" ? "scheduled" : "now")} className="rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">{saving ? "Saving…" : publishMode === "scheduled" ? "Schedule" : `Publish (${channels.length})`}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
