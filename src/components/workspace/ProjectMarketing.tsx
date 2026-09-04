"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ImagePlus,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import ProjectSocialAccounts from "./ProjectSocialAccounts";

const CHANNELS = [
  { id: "x", label: "X", color: "bg-white text-black" },
  { id: "reddit", label: "Reddit", color: "bg-[#ff4500] text-white" },
  { id: "youtube", label: "YouTube", color: "bg-[#ff0033] text-white" },
  { id: "tiktok", label: "TikTok", color: "bg-zinc-950 text-white" },
  { id: "instagram", label: "Instagram", color: "bg-[#d62976] text-white" },
  { id: "facebook", label: "Facebook", color: "bg-[#1877f2] text-white" },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];
type DeliveryStatus =
  | "draft"
  | "scheduled"
  | "pending"
  | "publishing"
  | "published"
  | "failed"
  | "unknown";
type SocialDelivery = {
  channel: ChannelId;
  status: DeliveryStatus;
  error?: string;
  remoteUrl?: string;
};
type SocialPost = {
  _id: Id<"socialPosts">;
  content: string;
  channels: ChannelId[];
  scheduledFor: number;
  status: "draft" | "scheduled" | "publishing" | "published" | "failed";
  error?: string;
  deliveries?: SocialDelivery[];
};

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = (next.getDay() + 6) % 7;
  next.setDate(next.getDate() - day);
  next.setHours(0, 0, 0, 0);
  return next;
}

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function ProjectMarketing({ conversationId }: { conversationId: Id<"conversations"> }) {
  const { authToken } = useAuth();
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(api.social.getAccess, { now: accessNow, conversationId });
  const posts = useQuery(api.social.listPosts, { conversationId }) as SocialPost[] | undefined;
  const createPost = useMutation(api.social.createPost);
  const publishNow = useMutation(api.social.publishNow);
  const removePost = useMutation(api.social.removePost);
  const requestKey = useRef(crypto.randomUUID());
  const [publishMode, setPublishMode] = useState<"now" | "scheduled">("now");
  const [mediaPreviews, setMediaPreviews] = useState<{ url: string; type: string }[]>([]);

  const [weekAnchor, setWeekAnchor] = useState(() => new Date());
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState("");
  const [channels, setChannels] = useState<ChannelId[]>(["x"]);
  const [scheduledFor, setScheduledFor] = useState(() => {
    const next = new Date(Date.now() + 60 * 60 * 1000);
    next.setMinutes(0, 0, 0);
    return localInputValue(next);
  });
  const [mediaStorageIds, setMediaStorageIds] = useState<string[]>([]);
  const [mediaNames, setMediaNames] = useState<string[]>([]);
  const [redditCommunity, setRedditCommunity] = useState("");
  const [facebookPageId, setFacebookPageId] = useState("");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const week = useMemo(() => {
    const first = startOfWeek(weekAnchor);
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(first);
      date.setDate(first.getDate() + index);
      return date;
    });
  }, [weekAnchor]);

  const postsForDay = (date: Date) =>
    (posts || []).filter((post) => {
      const scheduled = new Date(post.scheduledFor);
      return scheduled.toDateString() === date.toDateString();
    });

  const toggleChannel = (id: ChannelId) => {
    setChannels((current) =>
      current.includes(id)
        ? current.filter((channel) => channel !== id)
        : access?.maxChannelsPerPost === 1
          ? [id]
          : [...current, id],
    );
  };

  const uploadMedia = async (files: FileList | null) => {
    if (!files?.length) return;
    setComposerError(null);
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        if (file.size > 4_000_000) throw new Error("Use media below 4 MB for this upload route.");
        const form = new FormData();
        form.set("file", file);
        form.set("conversationId", conversationId);
        const response = await fetch("/api/social/media", { method: "POST", headers: { Authorization: `Bearer ${authToken}` }, body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Upload failed.");
        setMediaStorageIds(current => [...current, data.storageId]);
        setMediaPreviews(current => [...current, { url: data.url, type: file.type }]);
        setMediaNames((current) => [...current, file.name]);
      }
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Media upload failed");
    }
  };

  const save = async (status: "draft" | "scheduled" | "now") => {
    if (saving) return;
    setSaving(true);
    setComposerError(null);
    try {
      const postId = await createPost({
        conversationId,
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
          youtubePrivacy,
          tiktokPrivacy: channels.includes("tiktok") ? tiktokPrivacy : undefined,
        },
      });
      if (status === "now") await publishNow({ postId });
      requestKey.current = crypto.randomUUID();
      setMediaPreviews([]);
      setComposerOpen(false);
      setContent("");
      setMediaStorageIds([]);
      setMediaNames([]);
      setRedditCommunity("");
      setYoutubeTitle("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to save post");
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    if (!aiPrompt.trim() || !authToken || aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/social/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ prompt: aiPrompt, channels, conversationId, requestKey: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate post");
      setAiDraft(data.text || "");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Unable to generate post");
    } finally {
      setAiLoading(false);
    }
  };

  if (access === undefined || posts === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-[#090909] text-zinc-500">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0b0b0b] p-6">
        <div className="max-w-lg rounded-[28px] border border-[#ff5f2e]/30 bg-[#15110f] p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#ff5f2e] text-white">
            <CalendarDays size={26} />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-white">Cryzo Social</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Plan campaigns, create posts with AI, and publish across seven networks from one calendar.
          </p>
          <Link href="/chat/billing" className="mt-6 inline-flex rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black">
            Upgrade to Starter
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-full min-h-0 bg-[#0a0a0a] text-white xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-b border-zinc-800 bg-[#101010] p-5 xl:border-b-0 xl:border-r">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={17} className="text-[#ff7550]" />
          Social copilot
        </div>
        <h2 className="mt-5 text-2xl font-semibold leading-tight">Create your next campaign.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            Cryzo writes the copy. Composio uses your connected accounts to publish it.
          </p>
          <Link
            href="/chat/apps"
            className="mt-3 inline-flex text-xs font-semibold text-[#ff7550] hover:text-[#ff9a7f]"
          >
            Connect or manage social accounts
          </Link>
        <textarea
          value={aiPrompt}
          onChange={(event) => setAiPrompt(event.target.value)}
          placeholder="Announce our new product with a confident, playful tone..."
          className="mt-5 min-h-32 w-full resize-none rounded-2xl border border-zinc-700 bg-black p-4 text-sm outline-none placeholder:text-zinc-600 focus:border-[#ff7550]"
        />
        <button
          type="button"
          onClick={() => void generateDraft()}
          disabled={!aiPrompt.trim() || aiLoading}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5f2e] text-sm font-semibold disabled:opacity-40"
        >
          {aiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Generate draft
        </button>
        {aiError && <p className="mt-3 text-xs leading-5 text-red-400">{aiError}</p>}
        {aiDraft && (
          <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{aiDraft}</p>
            <button
              type="button"
              onClick={() => {
                setContent(aiDraft);
                setComposerOpen(true);
              }}
              className="mt-4 text-xs font-semibold text-[#ff7550]"
            >
              Use this draft
            </button>
          </div>
        )}
      </aside>

      <main className="flex min-h-0 flex-col overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div>
            <h1 className="text-xl font-semibold">Marketing</h1>
            <p className="text-xs text-zinc-500">
              {access.monthlyPostLimit === null
                ? "Starter: scheduling and 7 accounts. Deliveries use integration credits."
                : `Free: ${access.postsUsed}/${access.monthlyPostLimit} posts this month, one network per post`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/chat/apps"
              className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300"
            >
              Connections
            </Link>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black"
            >
              Create post
            </button>
          </div>
        </header>

        <ProjectSocialAccounts conversationId={conversationId} />
        <div className="px-5 py-3 text-xs text-zinc-400">
          {posts.filter(post => post.status === "published").length} published · {posts.filter(post => post.status === "scheduled").length} scheduled · {posts.filter(post => post.status === "failed").length} need attention
          <span className="block mt-1 text-zinc-600">Delivery totals for this project. Engagement metrics appear only when supplied by the network.</span>
        </div>
        {composerError && !composerOpen && <p role="alert" className="px-5 py-2 text-sm text-red-400">{composerError}</p>}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <button type="button" onClick={() => setWeekAnchor(new Date())} className="rounded-lg border border-zinc-700 px-3 py-2 text-xs">
            Today
          </button>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Previous week" onClick={() => setWeekAnchor((current) => new Date(current.getTime() - 7 * 86400000))} className="rounded-lg p-2 hover:bg-zinc-900">
              <ChevronLeft size={18} />
            </button>
            <span className="min-w-40 text-center text-sm font-medium">
              {week[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} - {week[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <button type="button" aria-label="Next week" onClick={() => setWeekAnchor((current) => new Date(current.getTime() + 7 * 86400000))} className="rounded-lg p-2 hover:bg-zinc-900">
              <ChevronRight size={18} />
            </button>
          </div>
          <span className="rounded-full border border-zinc-800 px-3 py-1.5 text-[11px] text-zinc-500">Week</span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="grid min-w-[900px] grid-cols-7 overflow-hidden rounded-2xl border border-zinc-800">
            {week.map((day) => (
              <section key={day.toISOString()} className="min-h-[560px] border-r border-zinc-800 bg-[#0d0d0d] last:border-r-0">
                <div className={`border-b border-zinc-800 p-3 ${day.toDateString() === new Date().toDateString() ? "bg-[#ff5f2e]/10" : ""}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{day.getDate()}</p>
                </div>
                <div className="space-y-2 p-2">
                  {postsForDay(day).map((post) => (
                    <article key={post._id} className="group rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold uppercase ${post.status === "failed" ? "text-red-400" : post.status === "published" ? "text-emerald-400" : "text-[#ff7550]"}`}>
                          {post.status}
                        </span>
                        <button type="button" onClick={() => void removePost({ postId: post._id }).catch(error => setComposerError(error.message))} className="opacity-0 text-zinc-600 group-hover:opacity-100 hover:text-red-400" aria-label="Delete post">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <p className="mt-2 line-clamp-4 text-xs leading-5 text-zinc-300">{post.content}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(post.deliveries?.length
                          ? post.deliveries
                          : post.channels.map((channel: ChannelId) => ({
                              channel,
                              status: post.status,
                            }))
                        ).map((delivery: SocialDelivery) => (
                          <span
                            key={delivery.channel}
                            title={delivery.error || delivery.remoteUrl || delivery.status}
                            className={`rounded px-1.5 py-1 text-[9px] uppercase ${
                              delivery.status === "published"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : delivery.status === "failed" || delivery.status === "unknown"
                                  ? "bg-red-500/15 text-red-300"
                                  : "bg-zinc-800 text-zinc-400"
                            }`}
                          >
                            {delivery.channel}: {delivery.status}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 flex items-center gap-1 text-[10px] text-zinc-600">
                        <Clock3 size={10} />
                        {new Date(post.scheduledFor).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                      {(post.status === "draft" || post.status === "failed") && (
                        <button type="button" onClick={() => void publishNow({ postId: post._id }).catch(error => setComposerError(error.message))} className="mt-3 text-[10px] font-semibold text-[#ff7550]">
                          Publish now
                        </button>
                      )}
                      {post.error && <p className="mt-2 text-[10px] leading-4 text-red-400">{post.error}</p>}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      {composerOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Publish to social media" className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-zinc-700 bg-[#151515] p-5 shadow-2xl sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Create post</h2>
                <p className="mt-1 text-xs text-zinc-500">One idea, adapted and published everywhere you choose.</p>
              </div>
              <button type="button" onClick={() => setComposerOpen(false)} className="rounded-full p-2 text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Close composer">
                <X size={20} />
              </button>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {CHANNELS.map((channel) => {
                const active = channels.includes(channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    onClick={() => toggleChannel(channel.id)}
                    className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${active ? channel.color + " border-transparent" : "border-zinc-700 text-zinc-500"}`}
                  >
                    {channel.label}
                  </button>
                );
              })}
            </div>
            {access.maxChannelsPerPost === 1 && (
              <p className="mt-3 text-xs text-zinc-500">
                Free includes one connected social account and 10 posts per month. Starter unlocks scheduling and seven accounts. Deliveries use integration credits.
              </p>
            )}
            <textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="Write something worth stopping for..."
              className="mt-5 min-h-52 w-full resize-none rounded-2xl border border-zinc-700 bg-black p-4 text-base leading-7 outline-none placeholder:text-zinc-600 focus:border-[#ff7550]"
            />
            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400 hover:border-zinc-500">
              <ImagePlus size={18} />
              Add images or videos
              <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => void uploadMedia(event.target.files)} />
            </label>
            {mediaNames.length > 0 && <p className="mt-2 text-xs text-zinc-500">{mediaNames.join(", ")}</p>}
            {channels.includes("reddit") && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400">Reddit community</label>
                <input
                  value={redditCommunity}
                  onChange={(event) => setRedditCommunity(event.target.value)}
                  placeholder="e.g. smallbusiness"
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]"
                />
              </div>
            )}
            {channels.includes("facebook") && (
              <label className="mt-4 block text-xs text-zinc-400">Facebook Page ID
                <input value={facebookPageId} onChange={event => setFacebookPageId(event.target.value)} inputMode="numeric" placeholder="Your connected Facebook Page ID" className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm" />
              </label>
            )}
            {channels.includes("youtube") && (
              <label className="mt-4 block text-xs text-zinc-400">YouTube visibility
                <select value={youtubePrivacy} onChange={event => setYoutubePrivacy(event.target.value)} className="ml-3 rounded bg-zinc-900 p-2">
                  <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
                </select>
              </label>
            )}
            {channels.includes("youtube") && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400">YouTube video title</label>
                <input
                  value={youtubeTitle}
                  onChange={(event) => setYoutubeTitle(event.target.value)}
                  placeholder="Video title"
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]"
                />
              </div>
            )}
            {channels.includes("tiktok") && (
              <div className="mt-4">
                <label className="text-xs font-medium text-zinc-400">TikTok privacy</label>
                <select
                  value={tiktokPrivacy}
                  onChange={(event) => setTiktokPrivacy(event.target.value)}
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]"
                >
                  <option value="PUBLIC_TO_EVERYONE">Public</option>
                  <option value="MUTUAL_FOLLOW_FRIENDS">Friends</option>
                  <option value="SELF_ONLY">Only me</option>
                </select>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-4">
              <p className="text-xs font-semibold text-zinc-400">Post preview · {channels.join(", ")}</p>
              {youtubeTitle && <h3 className="mt-2 font-semibold">{youtubeTitle}</h3>}
              <p className="mt-3 whitespace-pre-wrap text-sm">{content || "Your post preview will appear here."}</p>
              {mediaPreviews.map(media => media.type.startsWith("video/")
                ? <video key={media.url} src={media.url} controls className="mt-3 max-h-52 rounded-lg" />
                : <img key={media.url} src={media.url} alt="Post attachment" className="mt-3 max-h-52 rounded-lg" />)}
            </div>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="mb-2">When do you want to publish?</legend>
              <label className="block"><input type="radio" checked={publishMode === "now"} onChange={() => setPublishMode("now")} /> Publish now</label>
              <label className="block"><input type="radio" checked={publishMode === "scheduled"} disabled={access.monthlyPostLimit !== null} onChange={() => setPublishMode("scheduled")} /> Schedule for later</label>
              {access.monthlyPostLimit !== null && <Link href="/chat/billing" className="block text-sky-400">Upgrade to Starter to schedule posts</Link>}
            </fieldset>
            <div className="mt-4">
              <label className="text-xs font-medium text-zinc-400">Publish time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</label>
              <input type="datetime-local" disabled={publishMode !== "scheduled"} value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]" />
            </div>
            {composerError && <p className="mt-3 text-xs text-red-400">{composerError}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => void save("draft")} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300">
                Save draft
              </button>
              <button type="button" disabled={saving || !content.trim() || channels.length === 0} onClick={() => void save(publishMode)} className="inline-flex items-center gap-2 rounded-xl bg-[#ff5f2e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
                {saving ? <Loader2 className="animate-spin" size={15} /> : <Send size={15} />}
                {publishMode === "now" ? "Publish now" : "Schedule post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
