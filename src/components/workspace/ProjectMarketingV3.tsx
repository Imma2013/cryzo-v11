"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Loader2,
  MessageSquare,
  Paperclip,
  RotateCcw,
  Send,
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
  { id: "linkedin", label: "LinkedIn", color: "bg-[#0a66c2] text-white" },
  { id: "instagram", label: "Instagram", color: "bg-[#d62976] text-white" },
  { id: "facebook", label: "Facebook", color: "bg-[#1877f2] text-white" },
  { id: "youtube", label: "YouTube", color: "bg-[#ff0033] text-white" },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];
type DeliveryStatus = "draft" | "scheduled" | "pending" | "publishing" | "published" | "failed" | "unknown";
type SocialDelivery = { _id?: Id<"socialDeliveries">; channel: string; status: DeliveryStatus; error?: string };
type SocialAccount = { _id: Id<"socialAccounts">; channel: string; connectedAccountId: string; name: string };
type SocialPost = {
  _id: Id<"socialPosts">;
  content: string;
  channels: string[];
  scheduledFor: number;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  deliveries?: SocialDelivery[];
  mediaUrls?: string[];
};
type PublishingTarget = { id: string; name: string; username?: string };
type AgentMessage = { role: string; content: string };
type UploadedMedia = {
  storageId: string;
  url: string;
  name: string;
  contentType: string;
};

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

function channelLabel(id: string) {
  return CHANNELS.find((channel) => channel.id === id)?.label || id;
}

function isActiveChannel(value: string): value is ChannelId {
  return CHANNELS.some((channel) => channel.id === value);
}

function statusClass(status: string) {
  if (status === "published") return "bg-emerald-500/15 text-emerald-300";
  if (status === "failed" || status === "unknown") return "bg-red-500/15 text-red-300";
  if (status === "scheduled") return "bg-sky-500/15 text-sky-300";
  return "bg-zinc-800 text-zinc-300";
}

function friendlyDeliveryError(error?: string) {
  if (!error) return "The network did not confirm this delivery.";
  if (error.trim().startsWith("{")) return "The network rejected this delivery. Open the provider account, resolve the issue, then retry this network.";
  return error;
}

function deliveriesForPost(post: SocialPost): SocialDelivery[] {
  return post.deliveries?.length
    ? post.deliveries.filter((delivery) => isActiveChannel(delivery.channel))
    : post.channels.filter(isActiveChannel).map((channel) => ({ channel, status: post.status as DeliveryStatus }));
}

function MediaChips({ items, onRemove }: { items: UploadedMedia[]; onRemove: (index: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {items.map((item, index) => (
        <div key={`${item.storageId}-${index}`} className="relative min-w-40 max-w-48 rounded-xl border border-zinc-800 bg-zinc-950 p-2">
          <p className="truncate text-[11px] font-medium text-zinc-200">{item.name}</p>
          <p className="mt-0.5 truncate text-[10px] text-zinc-600">{item.contentType || "media"}</p>
          <button type="button" onClick={() => onRemove(index)} className="absolute right-1.5 top-1.5 rounded-full bg-black/80 p-1 text-zinc-400 hover:text-white" aria-label={`Remove ${item.name}`}>
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ProjectMarketingV3() {
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
  const [channels, setChannels] = useState<ChannelId[]>(["linkedin"]);
  const [scheduledFor, setScheduledFor] = useState(() => localInputValue(new Date(Date.now() + 3_600_000)));
  const [composerMedia, setComposerMedia] = useState<UploadedMedia[]>([]);
  const [chatMedia, setChatMedia] = useState<UploadedMedia[]>([]);
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [accountSelections, setAccountSelections] = useState<Partial<Record<ChannelId, string>>>({});
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
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
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const composerFileInputRef = useRef<HTMLInputElement>(null);
  const activeProjectId = sourceProjectId || "";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("cryzo-marketing-history-v2");
      if (stored) setAgentHistory(JSON.parse(stored) as AgentMessage[]);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("cryzo-marketing-history-v2", JSON.stringify(agentHistory.slice(-40)));
    } catch {}
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
    void Promise.all(
      requested.map(async (channel) => {
        const accountId = accountSelections[channel];
        if (!accountId) return { channel, items: [] as PublishingTarget[] };
        const params = new URLSearchParams({ channel, accountId });
        const response = await fetch(`/api/social/targets?${params}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Could not load ${channel} destinations.`);
        return { channel, items: data.items as PublishingTarget[] };
      }),
    )
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
  const visiblePosts = useMemo(
    () => (posts || []).filter((post) => post.channels.some((channel) => isActiveChannel(channel))),
    [posts],
  );
  const postsForDay = (date: Date) => visiblePosts.filter((post) => new Date(post.scheduledFor).toDateString() === date.toDateString());

  const uploadFiles = async (files: FileList | null, target: "chat" | "composer") => {
    if (!files?.length || !authToken) return;
    setComposerError(null);
    setAiError(null);
    try {
      const currentCount = target === "chat" ? chatMedia.length : composerMedia.length;
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - currentCount))) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
          throw new Error("Marketing chat accepts images and videos only.");
        }
        if (file.size > 500_000_000) throw new Error("Use media below 500 MB.");
        const authorize = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: activeProjectId || undefined }),
        });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const upload = await fetch(permission.uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!upload.ok) throw new Error("Upload failed.");
        const { storageId } = await upload.json();
        const register = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeProjectId || undefined,
            storageId,
            contentType: file.type,
            name: file.name,
          }),
        });
        const data = await register.json();
        if (!register.ok) throw new Error(data.error || "Upload registration failed.");
        const item: UploadedMedia = {
          storageId: String(data.storageId),
          url: String(data.url),
          name: file.name,
          contentType: file.type,
        };
        if (target === "chat") setChatMedia((current) => [...current, item]);
        else setComposerMedia((current) => [...current, item]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media upload failed";
      if (target === "chat") setAiError(message);
      else setComposerError(message);
    }
  };

  const generateDraft = async () => {
    if (!aiPrompt.trim() || !authToken || aiLoading) return;
    const prompt = aiPrompt.trim();
    setAiPrompt("");
    setAiLoading(true);
    setAiError(null);
    setAgentHistory((current) => [...current, { role: "user", content: prompt }]);
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
          media: chatMedia.map((item) => ({ url: item.url, name: item.name, contentType: item.contentType })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.error === "no_integration_credits") throw new Error("You need integration credits before Cryzo can publish through a connected account.");
        throw new Error(data.error || "Unable to generate marketing response");
      }
      const text = String(data.text || "");
      setAgentHistory((current) => [...current, { role: "assistant", content: text }].slice(-40));
      if (!data.actionExecuted) setAiDraft(text);
      else setAiDraft("");
      setChatMedia([]);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to generate marketing response");
    } finally {
      setAiLoading(false);
    }
  };

  const toggleChannel = (id: ChannelId) =>
    setChannels((current) =>
      current.includes(id)
        ? current.filter((channel) => channel !== id)
        : access?.maxChannelsPerPost === 1
          ? [id]
          : [...current, id],
    );

  const save = async (status: "draft" | "scheduled" | "now") => {
    if (saving) return;
    setSaving(true);
    setComposerError(null);
    try {
      const postId = await createPost({
        conversationId: activeProjectId ? (activeProjectId as Id<"conversations">) : undefined,
        requestKey: crypto.randomUUID(),
        content,
        channels: channels as any,
        scheduledFor: status === "scheduled" ? new Date(scheduledFor).getTime() : Date.now(),
        status: status === "scheduled" ? "scheduled" : "draft",
        mediaStorageIds: composerMedia.map((item) => item.storageId) as Id<"_storage">[],
        platformOptions: {
          youtubeTitle: youtubeTitle.trim() || undefined,
          youtubePrivacy,
          facebookPageId: facebookPageId.trim() || undefined,
          instagramUserId: instagramUserId.trim() || undefined,
          instagramPostType: channels.includes("instagram") ? instagramPostType : undefined,
          linkedinAuthorUrn: channels.includes("linkedin") ? linkedinAuthorUrn.trim() || undefined : undefined,
          linkedinVisibility: channels.includes("linkedin") ? linkedinVisibility : undefined,
          accountSelections: channels.flatMap((channel) =>
            accountSelections[channel]
              ? [{ channel, connectedAccountId: accountSelections[channel]! }]
              : [],
          ) as any,
        },
      } as any);
      if (status === "now") await publishNow({ postId });
      setComposerOpen(false);
      setContent("");
      setComposerMedia([]);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to save post");
    } finally {
      setSaving(false);
    }
  };

  if (access === undefined || posts === undefined) {
    return <div className="flex h-full items-center justify-center bg-[#090909] text-zinc-500"><Loader2 className="animate-spin" size={22} /></div>;
  }

  const postCard = (post: SocialPost) => (
    <button key={String(post._id)} type="button" onClick={() => setSelectedPost(post)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 p-2.5 text-left transition hover:border-zinc-600">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-semibold text-zinc-300">{post.channels.filter(isActiveChannel).map(channelLabel).join(" · ")}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase ${statusClass(post.status)}`}>{post.status}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-400">{post.content || "Untitled post"}</p>
    </button>
  );

  const chatPanel = (mobile: boolean) => (
    <section className={`min-h-0 flex-col bg-[#0d0d0d] ${mobile ? "flex h-full" : "hidden xl:flex xl:border-r xl:border-zinc-800"}`}>
      <header className="border-b border-zinc-800 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-[#ff7550]" />Marketing copilot</div>
            <p className="mt-1 text-xs text-zinc-500">Draft, attach media, publish, or schedule through your connected accounts.</p>
          </div>
          {mobile && <button type="button" onClick={() => setMobilePane("calendar")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold">Calendar</button>}
        </div>
        {projects && projects.length > 0 && (
          <select value={activeProjectId} onChange={(event) => setSourceProjectId(event.target.value)} className="mt-4 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs">
            <option value="">New chat (no project context)</option>
            {projects.map((project) => <option key={project._id} value={project._id}>{project.title}</option>)}
          </select>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {CHANNELS.map((channel) => (
            <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold ${channels.includes(channel.id) ? `${channel.color} border-transparent` : "border-zinc-700 text-zinc-500"}`}>
              {channel.label}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
        {agentHistory.length === 0 ? (
          <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
            <MessageSquare size={30} className="text-zinc-700" />
            <p className="mt-3 text-sm font-medium text-zinc-300">Your connected-account marketing agent</p>
            <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-600">Say “write a LinkedIn post” to draft, or “post this on LinkedIn” to let Cryzo execute the connected social tool.</p>
          </div>
        ) : agentHistory.map((message, index) => (
          <div key={`${message.role}-${index}`} className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === "user" ? "ml-auto bg-white text-black" : "mr-auto border border-zinc-800 bg-[#171717] text-zinc-200"}`}>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
        {aiLoading && <div className="mr-auto flex items-center gap-2 rounded-2xl border border-zinc-800 bg-[#171717] px-4 py-3 text-sm text-zinc-400"><Loader2 size={14} className="animate-spin" />Working…</div>}
        {aiError && <p className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{aiError}</p>}
      </div>

      <footer className="border-t border-zinc-800 p-4">
        <div className="rounded-2xl border border-zinc-700 bg-black p-3 focus-within:border-[#ff7550]">
          <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void generateDraft(); } }} placeholder="Ask Cryzo to draft, post, or schedule…" className="min-h-28 w-full resize-none bg-transparent text-sm outline-none placeholder:text-zinc-600" />
          <MediaChips items={chatMedia} onRemove={(index) => setChatMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
          <div className="mt-3 flex items-center justify-between gap-3">
            <input ref={chatFileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(event) => { void uploadFiles(event.target.files, "chat"); event.currentTarget.value = ""; }} />
            <button type="button" onClick={() => chatFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-600"><Paperclip size={14} />Image / video</button>
            <button type="button" disabled={!aiPrompt.trim() || aiLoading} onClick={() => void generateDraft()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black disabled:opacity-40"><Send size={13} />Send</button>
          </div>
        </div>
        {aiDraft && <button type="button" onClick={() => { setContent(aiDraft); setPublishMode("now"); setComposerOpen(true); }} className="mt-2 w-full rounded-xl border border-[#ff7550]/30 bg-[#ff7550]/10 px-3 py-2 text-xs font-semibold text-[#ff9b7e]">Use latest draft in composer</button>}
      </footer>
    </section>
  );

  const weekTitle = `${week[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${week[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="h-full min-h-0 bg-[#090909] text-white">
      <div className="hidden h-full min-h-0 xl:grid xl:grid-cols-[minmax(460px,520px)_minmax(0,1fr)]">
        {chatPanel(false)}
        <main className="flex min-h-0 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
            <div><h1 className="text-xl font-semibold">Marketing</h1><p className="mt-1 text-xs text-zinc-500">Plan, publish, and review delivery from one workspace.</p></div>
            <button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black">Create post</button>
          </header>
          <ProjectSocialAccounts />
          <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setAnchor(new Date())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">Today</button>
              <button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - (calendarView === "week" ? 7 : 30)))} className="p-2 text-zinc-500"><ChevronLeft size={18} /></button>
              <button type="button" onClick={() => setAnchor((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + (calendarView === "week" ? 7 : 30)))} className="p-2 text-zinc-500"><ChevronRight size={18} /></button>
              <span className="ml-1 text-sm font-semibold">{calendarView === "week" ? weekTitle : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
            </div>
            <div className="flex rounded-xl border border-zinc-800 p-1">
              {(["week", "month"] as const).map((view) => <button key={view} type="button" onClick={() => setCalendarView(view)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${calendarView === view ? "bg-white text-black" : "text-zinc-500"}`}>{view}</button>)}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {calendarView === "week" ? (
              <div className="grid min-w-[980px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">
                {week.map((day) => (
                  <section key={day.toISOString()} className="min-h-[540px] border-r border-zinc-800 bg-[#0d0d0d] last:border-r-0">
                    <div className={`border-b border-zinc-800 p-3 ${day.toDateString() === new Date().toDateString() ? "bg-[#ff5f2e]/10" : ""}`}>
                      <p className="text-[10px] uppercase tracking-widest text-zinc-600">{day.toLocaleDateString(undefined, { weekday: "short" })}</p>
                      <p className="mt-1 text-lg font-semibold">{day.getDate()}</p>
                    </div>
                    <div className="space-y-2 p-2">{postsForDay(day).map(postCard)}</div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid min-w-[920px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">
                {month.map((day) => (
                  <section key={day.toISOString()} className={`min-h-[150px] border-b border-r border-zinc-800 p-2 ${day.getMonth() === anchor.getMonth() ? "bg-[#0d0d0d]" : "bg-black/20 opacity-50"}`}>
                    <p className="mb-2 text-xs font-semibold text-zinc-500">{day.getDate()}</p>
                    <div className="space-y-1.5">{postsForDay(day).slice(0, 3).map(postCard)}</div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      <div className="flex h-full min-h-0 flex-col xl:hidden">
        {mobilePane === "chat" ? chatPanel(true) : (
          <main className="flex h-full min-h-0 flex-col overflow-hidden">
            <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
              <div><h1 className="text-base font-semibold">Marketing</h1><p className="text-[10px] text-zinc-600">Calendar</p></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setMobilePane("chat")} className="rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold"><MessageSquare size={14} className="mr-1 inline" />Chat</button>
                <button type="button" onClick={() => setComposerOpen(true)} className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black">Create</button>
              </div>
            </header>
            <ProjectSocialAccounts />
            <div className="border-b border-zinc-800 px-3 py-3">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => { const next = new Date(mobileDay); next.setDate(next.getDate() - 7); setMobileDay(next); }} className="p-2 text-zinc-500"><ChevronLeft size={18} /></button>
                <p className="text-sm font-semibold">{startOfWeek(mobileDay).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p>
                <button type="button" onClick={() => { const next = new Date(mobileDay); next.setDate(next.getDate() + 7); setMobileDay(next); }} className="p-2 text-zinc-500"><ChevronRight size={18} /></button>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }, (_, index) => {
                  const day = new Date(startOfWeek(mobileDay));
                  day.setDate(day.getDate() + index);
                  const active = day.toDateString() === mobileDay.toDateString();
                  return <button key={day.toISOString()} type="button" onClick={() => setMobileDay(day)} className={`rounded-xl px-1 py-2 text-center ${active ? "bg-white text-black" : "bg-zinc-950 text-zinc-400"}`}><span className="block text-[9px] uppercase">{day.toLocaleDateString(undefined, { weekday: "narrow" })}</span><span className="mt-1 block text-sm font-semibold">{day.getDate()}</span></button>;
                })}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="text-sm font-semibold">{mobileDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h2>
              <div className="mt-3 space-y-3">{postsForDay(mobileDay).length ? postsForDay(mobileDay).map(postCard) : <div className="rounded-2xl border border-dashed border-zinc-800 py-12 text-center text-sm text-zinc-600">No posts scheduled for this day.</div>}</div>
            </div>
          </main>
        )}
      </div>

      {selectedPost && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/65" onClick={() => setSelectedPost(null)}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-[#111] p-5" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div><p className="text-xs uppercase tracking-widest text-zinc-600">Post details</p><h2 className="mt-1 text-lg font-semibold">{new Date(selectedPost.scheduledFor).toLocaleString()}</h2></div>
              <button type="button" onClick={() => setSelectedPost(null)} className="p-2 text-zinc-500"><X size={18} /></button>
            </div>
            <div className="mt-5 overflow-hidden rounded-2xl border border-zinc-800">
              <SocialPostPreview channel={selectedPost.channels.find(isActiveChannel) || "linkedin"} content={selectedPost.content} accountName={socialAccounts?.find((account) => account.channel === selectedPost.channels.find(isActiveChannel))?.name || "Your account"} media={(selectedPost.mediaUrls || []).map((url) => ({ url }))} />
            </div>
            <div className="mt-5 space-y-3">
              {deliveriesForPost(selectedPost).map((delivery) => (
                <div key={delivery._id ? String(delivery._id) : delivery.channel} className="rounded-2xl border border-zinc-800 bg-black/40 p-4">
                  <div className="flex items-center justify-between"><p className="text-sm font-semibold">{channelLabel(delivery.channel)}</p><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${statusClass(delivery.status)}`}>{delivery.status}</span></div>
                  {(delivery.status === "failed" || delivery.status === "unknown") && <p className="mt-3 text-xs leading-5 text-red-300">{friendlyDeliveryError(delivery.error)}</p>}
                  {delivery.status === "failed" && delivery._id && <button type="button" onClick={() => void retryDelivery({ deliveryId: delivery._id! })} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold"><RotateCcw size={12} />Retry this network</button>}
                </div>
              ))}
            </div>
            <button type="button" onClick={() => void removePost({ postId: selectedPost._id }).then(() => setSelectedPost(null))} className="mt-6 inline-flex items-center gap-2 text-xs font-semibold text-red-400"><Trash2 size={13} />Delete post</button>
          </aside>
        </div>
      )}

      {composerOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3">
          <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-[26px] border border-zinc-700 bg-[#151515] p-5 sm:p-7">
            <div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-widest text-zinc-600">Create post</p><h2 className="mt-1 text-xl font-semibold">Publish across connected accounts</h2></div><button type="button" onClick={() => setComposerOpen(false)} className="p-2 text-zinc-500"><X size={18} /></button></div>

            <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write your post…" className="mt-5 min-h-44 w-full rounded-2xl border border-zinc-700 bg-black p-4 text-sm outline-none placeholder:text-zinc-600" />

            <div className="mt-4 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => <button key={channel.id} type="button" onClick={() => toggleChannel(channel.id)} className={`rounded-full border px-3 py-2 text-xs font-semibold ${channels.includes(channel.id) ? `${channel.color} border-transparent` : "border-zinc-700 text-zinc-500"}`}>{channel.label}</button>)}
            </div>

            <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-4">
              <div className="flex items-center justify-between"><div><p className="text-sm font-semibold">Media</p><p className="mt-1 text-xs text-zinc-600">Up to 10 images/videos, 500 MB each.</p></div><button type="button" onClick={() => composerFileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold"><ImagePlus size={14} />Add media</button></div>
              <input ref={composerFileInputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(event) => { void uploadFiles(event.target.files, "composer"); event.currentTarget.value = ""; }} />
              <MediaChips items={composerMedia} onRemove={(index) => setComposerMedia((current) => current.filter((_, itemIndex) => itemIndex !== index))} />
            </div>

            {channels.includes("facebook") && (
              <div className="mt-4"><label className="text-xs font-medium text-zinc-400">Facebook Page</label><select value={facebookPageId} onChange={(event) => setFacebookPageId(event.target.value)} disabled={targetsLoading} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="">Choose page</option>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></div>
            )}
            {channels.includes("instagram") && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="text-xs font-medium text-zinc-400">Instagram account</label><select value={instagramUserId} onChange={(event) => setInstagramUserId(event.target.value)} disabled={targetsLoading} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="">Choose account</option>{instagramTargets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}</select></div><div><label className="text-xs font-medium text-zinc-400">Format</label><select value={instagramPostType} onChange={(event) => setInstagramPostType(event.target.value as any)} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></div></div>
            )}
            {channels.includes("youtube") && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="text-xs font-medium text-zinc-400">YouTube title</label><input value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs" /></div><div><label className="text-xs font-medium text-zinc-400">Privacy</label><select value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div></div>
            )}
            {channels.includes("linkedin") && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2"><div><label className="text-xs font-medium text-zinc-400">LinkedIn author URN (optional)</label><input value={linkedinAuthorUrn} onChange={(event) => setLinkedinAuthorUrn(event.target.value)} placeholder="Auto from connected account" className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs" /></div><div><label className="text-xs font-medium text-zinc-400">Visibility</label><select value={linkedinVisibility} onChange={(event) => setLinkedinVisibility(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-zinc-700 bg-black px-3 text-xs"><option value="PUBLIC">Public</option><option value="CONNECTIONS">Connections</option></select></div></div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-800 bg-black/30 p-4">
              <button type="button" onClick={() => setPublishMode("now")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${publishMode === "now" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Publish now</button>
              <button type="button" disabled={!access?.canSchedule} onClick={() => setPublishMode("scheduled")} className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40 ${publishMode === "scheduled" ? "bg-white text-black" : "border border-zinc-700 text-zinc-400"}`}>Schedule</button>
              {publishMode === "scheduled" && <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="h-10 rounded-xl border border-zinc-700 bg-black px-3 text-xs" />}
            </div>

            {composerError && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{composerError}</p>}

            <div className="mt-6 flex flex-wrap justify-between gap-3 border-t border-zinc-800 pt-5">
              <button type="button" disabled={saving || !content.trim() || !channels.length} onClick={() => void save("draft")} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-xs font-semibold text-zinc-300 disabled:opacity-40">Save draft</button>
              <button type="button" disabled={saving || !content.trim() || !channels.length} onClick={() => void save(publishMode === "scheduled" ? "scheduled" : "now")} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}{publishMode === "scheduled" ? "Schedule" : `Publish (${channels.length})`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
