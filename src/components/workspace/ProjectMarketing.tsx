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
  Plus,
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
  { id: "x", label: "X", color: "bg-white text-black" },
  { id: "linkedin", label: "LinkedIn", color: "bg-[#0a66c2] text-white" },
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
  _id?: Id<"socialDeliveries">;
  channel: ChannelId;
  status: DeliveryStatus;
  error?: string;
  remoteUrl?: string;
  toolSlug?: string;
  providerLogId?: string;
  attempts?: number;
};
type SocialAccount = {
  _id: Id<"socialAccounts">;
  channel: ChannelId;
  connectedAccountId: string;
  name: string;
};

type PublishingTarget = {
  id: string;
  name: string;
  username?: string;
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

export default function ProjectMarketing() {
  const { authToken, userId } = useAuth();
  const [accessNow] = useState(() => Date.now());
  const access = useQuery(api.social.getAccess, { now: accessNow });
  const posts = useQuery(api.social.listPosts, {}) as SocialPost[] | undefined;
  const socialAccounts = useQuery(api.social.listAccounts, {}) as
    | SocialAccount[]
    | undefined;
  const projects = useQuery(
    api.conversations.list,
    userId ? { userId } : "skip",
  );
  const createPost = useMutation(api.social.createPost);
  const publishNow = useMutation(api.social.publishNow);
  const retryDelivery = useMutation(api.social.retryDelivery);
  const removePost = useMutation(api.social.removePost);
  const requestKey = useRef(crypto.randomUUID());
  const aiMediaInputRef = useRef<HTMLInputElement>(null);
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
  const [facebookPages, setFacebookPages] = useState<PublishingTarget[]>([]);
  const [instagramUserId, setInstagramUserId] = useState("");
  const [instagramTargets, setInstagramTargets] = useState<PublishingTarget[]>([]);
  const [instagramPostType, setInstagramPostType] = useState<
    "post" | "reel" | "story" | "carousel"
  >("post");
  const [accountSelections, setAccountSelections] = useState<
    Partial<Record<ChannelId, string>>
  >({});
  const [targetsLoading, setTargetsLoading] = useState(false);
  const [targetsError, setTargetsError] = useState("");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [tiktokPrivacy, setTiktokPrivacy] = useState("SELF_ONLY");
  const [linkedinAuthorUrn, setLinkedinAuthorUrn] = useState("");
  const [linkedinVisibility, setLinkedinVisibility] = useState("PUBLIC");
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiDraft, setAiDraft] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [agentHistory, setAgentHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const activeProjectId = sourceProjectId || projects?.[0]?._id || "";

  useEffect(() => {
    if (!socialAccounts) return;
    setAccountSelections((current) => {
      const next = { ...current };
      let changed = false;
      for (const channel of CHANNELS) {
        const options = socialAccounts.filter(
          (account) => account.channel === channel.id,
        );
        if (
          !next[channel.id] ||
          !options.some(
            (account) => account.connectedAccountId === next[channel.id],
          )
        ) {
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
            setFacebookPageId((current) =>
              result.items.some((item) => item.id === current)
                ? current
                : result.items[0]?.id ?? "",
            );
          } else {
            setInstagramTargets(result.items);
            setInstagramUserId((current) =>
              result.items.some((item) => item.id === current)
                ? current
                : result.items[0]?.id ?? "",
            );
          }
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setTargetsError(
            error instanceof Error ? error.message : "Could not load publishing destinations.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTargetsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    accountSelections.facebook,
    accountSelections.instagram,
    authToken,
    channels,
    composerOpen,
  ]);

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
    setConfirmed(false);
    setChannels((current) =>
      current.includes(id)
        ? current.filter((channel) => channel !== id)
        : access?.maxChannelsPerPost === 1
          ? [id]
          : [...current, id],
    );
  };

  const uploadMedia = async (
    files: FileList | null,
    surface: "composer" | "agent" = "composer",
  ) => {
    if (!files?.length) return;
    if (surface === "agent") setAiError(null);
    else setComposerError(null);
    setConfirmed(false);
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - mediaStorageIds.length))) {
        if (file.size > 500_000_000) throw new Error("Use media below 500 MB.");
        if (
          channels.includes("youtube") &&
          file.type.startsWith("image/") &&
          file.size > 2_000_000
        ) {
          throw new Error("YouTube thumbnails must be smaller than 2 MB.");
        }
        const authorize = await fetch("/api/social/media", { method: "POST", headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }, body: JSON.stringify({}) });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const upload = await fetch(permission.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error("Upload failed.");
        const { storageId } = await upload.json();
        const response = await fetch("/api/social/media", { method: "POST", headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ storageId, contentType: file.type, name: file.name }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Upload registration failed.");
        setMediaStorageIds(current => [...current, data.storageId]);
        setMediaPreviews(current => [...current, { url: data.url, type: file.type }]);
        setMediaNames((current) => [...current, file.name]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media upload failed";
      if (surface === "agent") setAiError(message);
      else setComposerError(message);
    }
  };

  const removeMedia = (index: number) => {
    setMediaStorageIds((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMediaPreviews((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setMediaNames((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setConfirmed(false);
  };

  const save = async (status: "draft" | "scheduled" | "now") => {
    if (saving) return;
    setSaving(true);
    setComposerError(null);
    try {
      if (status !== "draft" && !confirmed) throw new Error("Review the preview and confirm this exact post before publishing or scheduling.");
      const postId = await createPost({
        conversationId: activeProjectId
          ? (activeProjectId as Id<"conversations">)
          : undefined,
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
          instagramPostType: channels.includes("instagram")
            ? instagramPostType
            : undefined,
          accountSelections: channels.flatMap((channel) => {
            const connectedAccountId = accountSelections[channel];
            return connectedAccountId ? [{ channel, connectedAccountId }] : [];
          }),
          youtubePrivacy,
          tiktokPrivacy: channels.includes("tiktok") ? tiktokPrivacy : undefined,
          linkedinAuthorUrn: channels.includes("linkedin")
            ? linkedinAuthorUrn.trim() || undefined
            : undefined,
          linkedinVisibility: channels.includes("linkedin")
            ? linkedinVisibility
            : undefined,
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
      setLinkedinAuthorUrn("");
      setConfirmed(false);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Unable to save post");
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    if (!aiPrompt.trim() || !authToken || aiLoading) return;
    if (!activeProjectId) {
      setAiError("Create or choose a project to give the marketing agent brand context.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await fetch("/api/social/draft", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          channels,
          conversationId: activeProjectId,
          requestKey: crypto.randomUUID(),
          history: agentHistory,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate post");
      setAiDraft(data.text || "");
      const assistantText = String(data.text || "");
      setAgentHistory(current => [...current, { role: "user" as const, content: aiPrompt }, { role: "assistant" as const, content: assistantText }].slice(-8));
      setAiModel((data.fallbackUsed ? "Fallback: " : "") + (data.actualModel || ""));
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
            href="#social-accounts"
            className="mt-3 inline-flex text-xs font-semibold text-[#ff7550] hover:text-[#ff9a7f]"
          >
            Manage your connected accounts
          </Link>
        {projects && projects.length > 0 ? (
          <label className="mt-5 block text-xs font-medium text-zinc-400">
            Project context
            <select
              value={activeProjectId}
              onChange={(event) => setSourceProjectId(event.target.value)}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-[#ff7550]"
            >
              {projects.map((project) => (
                <option key={project._id} value={project._id}>
                  {project.title}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="mt-5 rounded-xl border border-zinc-800 bg-black p-3 text-xs leading-5 text-zinc-500">
            Create a project first so the agent can use its brand context. Manual
            drafts and publishing still work without one.
          </p>
        )}
        <div className="relative mt-5 rounded-2xl border border-zinc-700 bg-black focus-within:border-[#ff7550]">
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder="Announce our new product with a confident, playful tone..."
            className="min-h-32 w-full resize-none rounded-2xl bg-transparent p-4 pb-14 text-sm outline-none placeholder:text-zinc-600"
          />
          <input
            ref={aiMediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(event) => {
              void uploadMedia(event.target.files, "agent");
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => aiMediaInputRef.current?.click()}
            className="absolute bottom-3 left-3 grid h-8 w-8 place-items-center rounded-full border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:text-white"
            aria-label="Add photos or videos"
            title="Add photos or videos"
          >
            <Plus size={16} />
          </button>
          <span className="absolute bottom-4 left-14 text-[10px] text-zinc-600">
            Add photos or video
          </span>
        </div>
        {mediaNames.length > 0 && (
          <div className="mt-3 space-y-2">
            {mediaNames.map((name, index) => (
              <div key={`${name}-${index}`} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs text-zinc-300">
                <span className="truncate">{name}</span>
                <button type="button" onClick={() => removeMedia(index)} className="text-zinc-500 hover:text-red-400" aria-label={`Remove ${name}`}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => void generateDraft()}
          disabled={!aiPrompt.trim() || !activeProjectId || aiLoading}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#ff5f2e] text-sm font-semibold disabled:opacity-40"
        >
          {aiLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          Generate draft
        </button>
        {aiError && <p className="mt-3 text-xs leading-5 text-red-400">{aiError}</p>}
        {aiDraft && (
          <div className="mt-5 rounded-2xl border border-zinc-800 bg-black p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-300">{aiDraft}</p>
            {aiModel && <p className="mt-2 text-xs text-zinc-400">{aiModel}</p>}
            <button
              type="button"
              onClick={() => {
                setContent(aiDraft);
                setComposerOpen(true);
                setConfirmed(false);
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
              href="#social-accounts"
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

        <ProjectSocialAccounts />
        <div className="px-5 py-3 text-xs text-zinc-400">
          {posts.filter(post => post.status === "published").length} published · {posts.filter(post => post.status === "scheduled").length} scheduled · {posts.filter(post => post.status === "failed").length} need attention
          <span className="block mt-1 text-zinc-600">Delivery totals across Marketing. Engagement metrics appear only when supplied by the network.</span>
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
                  {postsForDay(day).map((post) => {
                    const deliveries = post.deliveries?.length
                      ? post.deliveries
                      : post.channels.map((channel: ChannelId) => ({
                          channel,
                          status: post.status as DeliveryStatus,
                        }));
                    const previewChannel = post.channels[0] ?? "x";
                    const previewAccount =
                      socialAccounts?.find((account) => account.channel === previewChannel)?.name ??
                      "Your account";

                    return (
                      <article key={post._id} className="group overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                        <SocialPostPreview
                          compact
                          channel={previewChannel}
                          content={post.content}
                          accountName={previewAccount}
                          media={(post.mediaUrls ?? []).map((url) => ({ url }))}
                        />
                        <div className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] font-semibold uppercase ${
                              post.status === "failed"
                                ? "text-red-400"
                                : post.status === "published"
                                  ? "text-emerald-400"
                                  : "text-[#ff7550]"
                            }`}>
                              {post.status}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                void removePost({ postId: post._id }).catch((error) =>
                                  setComposerError(error.message),
                                )
                              }
                              className="opacity-0 text-zinc-600 transition group-hover:opacity-100 hover:text-red-400 focus:opacity-100"
                              aria-label="Delete post"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {deliveries.map((delivery: SocialDelivery) => (
                              <div key={delivery._id ?? delivery.channel}>
                                <div
                                  className={`rounded-lg px-2 py-1.5 text-[9px] font-semibold uppercase ${
                                    delivery.status === "published"
                                      ? "bg-emerald-500/15 text-emerald-300"
                                      : delivery.status === "failed" ||
                                          delivery.status === "unknown"
                                        ? "bg-red-500/15 text-red-300"
                                        : "bg-zinc-800 text-zinc-400"
                                  }`}
                                >
                                  {delivery.channel}: {delivery.status}
                                </div>
                                {(delivery.status === "failed" ||
                                  delivery.status === "unknown") && (
                                  <div className="mt-1 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-[9px] leading-4 text-red-200">
                                    <p>{delivery.error || "The network did not confirm this post."}</p>
                                    {delivery.toolSlug && (
                                      <p className="mt-1 text-red-300/70">Action: {delivery.toolSlug}</p>
                                    )}
                                    {delivery.providerLogId && (
                                      <p className="text-red-300/70">Log: {delivery.providerLogId}</p>
                                    )}
                                    {delivery.status === "failed" && delivery._id && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void retryDelivery({ deliveryId: delivery._id! }).catch(
                                            (error) => setComposerError(error.message),
                                          )
                                        }
                                        className="mt-2 inline-flex items-center gap-1 font-semibold text-white"
                                      >
                                        <RotateCcw size={10} />
                                        Retry this network
                                      </button>
                                    )}
                                    {delivery.status === "unknown" && (
                                      <p className="mt-1 font-medium">
                                        Check the network before retrying to avoid a duplicate.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <p className="mt-3 flex items-center gap-1 text-[10px] text-zinc-600">
                            <Clock3 size={10} />
                            {new Date(post.scheduledFor).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                          {post.status === "draft" && (
                            <button
                              type="button"
                              onClick={() =>
                                void publishNow({ postId: post._id }).catch((error) =>
                                  setComposerError(error.message),
                                )
                              }
                              className="mt-3 text-[10px] font-semibold text-[#ff7550]"
                            >
                              Publish now
                            </button>
                          )}
                          {post.error && (
                            <p className="mt-2 text-[10px] leading-4 text-red-400">{post.error}</p>
                          )}
                        </div>
                      </article>
                    );
                  })}
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {channels.map((channel) => {
                const options =
                  socialAccounts?.filter((account) => account.channel === channel) ?? [];
                const label = CHANNELS.find((item) => item.id === channel)?.label ?? channel;
                return (
                  <label key={channel} className="block text-xs text-zinc-400">
                    {label} account
                    <select
                      value={accountSelections[channel] ?? ""}
                      onChange={(event) => {
                        setAccountSelections((current) => ({
                          ...current,
                          [channel]: event.target.value,
                        }));
                        setConfirmed(false);
                      }}
                      className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-[#ff7550]"
                    >
                      <option value="">Choose a connected account</option>
                      {options.map((account) => (
                        <option
                          key={account.connectedAccountId}
                          value={account.connectedAccountId}
                        >
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
            {channels.some(
              (channel) =>
                !socialAccounts?.some((account) => account.channel === channel),
            ) && (
              <p className="mt-3 text-xs text-amber-300">
                Connect every selected network before publishing. You can still save this as a draft.
              </p>
            )}
            <textarea
              value={content}
              onChange={(event) => { setContent(event.target.value); setConfirmed(false); }}
              placeholder="Write something worth stopping for..."
              className="mt-5 min-h-52 w-full resize-none rounded-2xl border border-zinc-700 bg-black p-4 text-base leading-7 outline-none placeholder:text-zinc-600 focus:border-[#ff7550]"
            />
            <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-zinc-700 p-4 text-sm text-zinc-400 hover:border-zinc-500">
              <ImagePlus size={18} />
              Add images or videos
              <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => void uploadMedia(event.target.files)} />
            </label>
            {mediaNames.length > 0 && <p className="mt-2 text-xs text-zinc-500">{mediaNames.join(", ")}</p>}
            {channels.includes("youtube") && (
              <p className="mt-2 text-xs text-zinc-500">
                Add one video and, optionally, one JPG, PNG, or GIF under 2 MB as its custom thumbnail.
              </p>
            )}
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
              <label className="mt-4 block text-xs text-zinc-400">
                Facebook Page
                <select
                  value={facebookPageId}
                  disabled={targetsLoading}
                  onChange={(event) => {
                    setFacebookPageId(event.target.value);
                    setConfirmed(false);
                  }}
                  className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-[#ff7550]"
                >
                  <option value="">
                    {targetsLoading ? "Loading managed Pages…" : "Choose a managed Page"}
                  </option>
                  {facebookPages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {channels.includes("instagram") && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  Instagram profile
                  <select
                    value={instagramUserId}
                    disabled={targetsLoading}
                    onChange={(event) => {
                      setInstagramUserId(event.target.value);
                      setConfirmed(false);
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-[#ff7550]"
                  >
                    <option value="">
                      {targetsLoading ? "Loading business profile…" : "Choose a Business or Creator profile"}
                    </option>
                    {instagramTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.username ? `@${target.username}` : target.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-zinc-400">
                  Instagram format
                  <select
                    value={instagramPostType}
                    onChange={(event) => {
                      setInstagramPostType(
                        event.target.value as
                          | "post"
                          | "reel"
                          | "story"
                          | "carousel",
                      );
                      setConfirmed(false);
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm text-white outline-none focus:border-[#ff7550]"
                  >
                    <option value="post">Image post</option>
                    <option value="reel">Reel</option>
                    <option value="story">Story</option>
                    <option value="carousel">Carousel (2–10 items)</option>
                  </select>
                </label>
              </div>
            )}
            {targetsError && (
              <p role="alert" className="mt-3 text-xs text-red-400">
                {targetsError}
              </p>
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
            {channels.includes("linkedin") && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block text-xs text-zinc-400">
                  LinkedIn author URN
                  <input
                    value={linkedinAuthorUrn}
                    onChange={(event) => {
                      setLinkedinAuthorUrn(event.target.value);
                      setConfirmed(false);
                    }}
                    placeholder="Optional · defaults to your profile"
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]"
                  />
                </label>
                <label className="block text-xs text-zinc-400">
                  LinkedIn visibility
                  <select
                    value={linkedinVisibility}
                    onChange={(event) => {
                      setLinkedinVisibility(event.target.value);
                      setConfirmed(false);
                    }}
                    className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]"
                  >
                    <option value="PUBLIC">Public</option>
                    <option value="CONNECTIONS">Connections</option>
                    <option value="LOGGED_IN">LinkedIn members</option>
                  </select>
                </label>
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
            <section className="mt-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">Live previews</h3>
                <span className="text-[10px] text-zinc-500">Adapted for each selected network</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {channels.map((channel) => (
                  <SocialPostPreview
                    key={channel}
                    channel={channel}
                    content={content || "Your post preview will appear here."}
                    title={channel === "youtube" ? youtubeTitle : undefined}
                    accountName={
                      socialAccounts?.find(
                        (account) =>
                          account.channel === channel &&
                          account.connectedAccountId === accountSelections[channel],
                      )?.name ?? "Your account"
                    }
                    media={mediaPreviews}
                  />
                ))}
              </div>
            </section>
            <fieldset className="mt-4 space-y-2 text-sm">
              <legend className="mb-2">When do you want to publish?</legend>
              <label className="block"><input type="radio" checked={publishMode === "now"} onChange={() => { setPublishMode("now"); setConfirmed(false); }} /> Publish now</label>
              <label className="block"><input type="radio" checked={publishMode === "scheduled"} disabled={!access.canSchedule} onChange={() => { setPublishMode("scheduled"); setConfirmed(false); }} /> Schedule for later</label>
              {!access.canSchedule && <Link href="/chat/billing" className="block text-sky-400">Upgrade to Starter to schedule posts</Link>}
            </fieldset>
            <div className="mt-4">
              <label className="text-xs font-medium text-zinc-400">Publish time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</label>
              <input type="datetime-local" disabled={publishMode !== "scheduled"} value={scheduledFor} onChange={(event) => { setScheduledFor(event.target.value); setConfirmed(false); }} className="mt-2 h-11 w-full rounded-xl border border-zinc-700 bg-black px-3 text-sm outline-none focus:border-[#ff7550]" />
              <label className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-800 bg-black/50 p-3 text-xs leading-5 text-zinc-300">
                <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" />
                I reviewed this exact copy, accounts, media, and publishing time. Editing any of them requires confirmation again.
              </label>
            </div>
            {composerError && <p className="mt-3 text-xs text-red-400">{composerError}</p>}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => void save("draft")} className="rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-300">
                Save draft
              </button>
              <button type="button" disabled={
                  saving ||
                  !confirmed ||
                  !content.trim() ||
                  channels.length === 0 ||
                  channels.some((channel) => !accountSelections[channel]) ||
                  (channels.includes("facebook") && !facebookPageId) ||
                  (channels.includes("instagram") && !instagramUserId)
                } onClick={() => void save(publishMode)} className="inline-flex items-center gap-2 rounded-xl bg-[#ff5f2e] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
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
