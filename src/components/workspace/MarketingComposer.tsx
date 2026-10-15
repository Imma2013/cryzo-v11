"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useAuth } from "@/providers/AuthProvider";
import { SocialNetworkLogo } from "@/components/SocialNetworkLogo";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const CHANNELS = ["x", "facebook", "instagram", "youtube", "linkedin", "tiktok"] as const;
type Channel = typeof CHANNELS[number];
type Account = { _id: Id<"socialAccounts">; channel: string; connectedAccountId: string; name: string };
type Upload = { storageId: string; url: string; name: string; contentType: string };

function localInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function MarketingComposer({
  open,
  initialDate,
  defaultChannels,
  accounts,
  canSchedule,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialDate: Date;
  defaultChannels: string[];
  accounts: Account[];
  canSchedule: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { authToken } = useAuth();
  const createPost = useMutation(api.social.createPost);
  const publishNow = useMutation(api.social.publishNow);
  const inputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [channels, setChannels] = useState<Channel[]>(["x"]);
  const [mode, setMode] = useState<"draft" | "schedule" | "publish">("schedule");
  const [scheduledFor, setScheduledFor] = useState(() => localInputValue(initialDate));
  const [media, setMedia] = useState<Upload[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [facebookPages, setFacebookPages] = useState<Array<{ id: string; name: string }>>([]);
  const [instagramTargets, setInstagramTargets] = useState<Array<{ id: string; name: string }>>([]);
  const [facebookPageId, setFacebookPageId] = useState("");
  const [instagramUserId, setInstagramUserId] = useState("");
  const [instagramPostType, setInstagramPostType] = useState<"post" | "reel" | "story" | "carousel">("post");
  const [youtubeTitle, setYoutubeTitle] = useState("");
  const [youtubePrivacy, setYoutubePrivacy] = useState("private");
  const [linkedinAuthorUrn, setLinkedinAuthorUrn] = useState("");
  const [linkedinVisibility, setLinkedinVisibility] = useState("PUBLIC");

  useEffect(() => {
    if (!open) return;
    const nextChannels = defaultChannels.filter((item): item is Channel => CHANNELS.includes(item as Channel));
    setChannels(nextChannels.length ? nextChannels : ["x"]);
    setScheduledFor(localInputValue(initialDate));
    setMode(canSchedule ? "schedule" : "draft");
    setError("");
  }, [open, initialDate, defaultChannels, canSchedule]);

  useEffect(() => {
    if (!open || !authToken) return;
    const load = async (channel: "facebook" | "instagram") => {
      const account = accounts.find((item) => item.channel === channel);
      if (!account) return [];
      const params = new URLSearchParams({ channel, accountId: account.connectedAccountId });
      const response = await fetch(`/api/social/targets?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Could not load ${channel} destinations.`);
      return (data.items || []) as Array<{ id: string; name: string }>;
    };
    if (channels.includes("facebook")) {
      void load("facebook").then((items) => {
        setFacebookPages(items);
        setFacebookPageId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || "");
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load Facebook Pages."));
    }
    if (channels.includes("instagram")) {
      void load("instagram").then((items) => {
        setInstagramTargets(items);
        setInstagramUserId((current) => items.some((item) => item.id === current) ? current : items[0]?.id || "");
      }).catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load Instagram accounts."));
    }
  }, [open, authToken, accounts, channels]);

  function toggle(channel: Channel) {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
  }

  async function upload(files: FileList | null) {
    if (!files?.length || !authToken) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, Math.max(0, 10 - media.length))) {
        if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) throw new Error("Use image or video media.");
        if (file.size > 500_000_000) throw new Error("Use media below 500 MB.");
        const authorize = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const permission = await authorize.json();
        if (!authorize.ok || !permission.uploadUrl) throw new Error(permission.error || "Upload could not start.");
        const uploaded = await fetch(permission.uploadUrl, { method: "POST", headers: { "Content-Type": file.type }, body: file });
        if (!uploaded.ok) throw new Error("Upload failed.");
        const { storageId } = await uploaded.json();
        const register = await fetch("/api/social/media", {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ storageId, contentType: file.type, name: file.name }),
        });
        const data = await register.json();
        if (!register.ok) throw new Error(data.error || "Upload registration failed.");
        setMedia((current) => [...current, { storageId: String(data.storageId), url: String(data.url), name: file.name, contentType: file.type }]);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!content.trim() || !channels.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const accountSelections = channels.flatMap((channel) => {
        const account = accounts.find((item) => item.channel === channel);
        return account ? [{ channel, connectedAccountId: account.connectedAccountId }] : [];
      });
      const date = mode === "schedule" ? new Date(scheduledFor).getTime() : Date.now();
      if (!Number.isFinite(date)) throw new Error("Choose a valid date and time.");
      const postId = await createPost({
        requestKey: crypto.randomUUID(),
        content: content.trim(),
        channels: channels as any,
        scheduledFor: date,
        status: mode === "schedule" ? "scheduled" : "draft",
        mediaStorageIds: media.map((item) => item.storageId) as Id<"_storage">[],
        platformOptions: {
          accountSelections: accountSelections as any,
          facebookPageId: channels.includes("facebook") ? facebookPageId || undefined : undefined,
          instagramUserId: channels.includes("instagram") ? instagramUserId || undefined : undefined,
          instagramPostType: channels.includes("instagram") ? instagramPostType : undefined,
          youtubeTitle: channels.includes("youtube") ? youtubeTitle || undefined : undefined,
          youtubePrivacy: channels.includes("youtube") ? youtubePrivacy : undefined,
          linkedinAuthorUrn: channels.includes("linkedin") ? linkedinAuthorUrn || undefined : undefined,
          linkedinVisibility: channels.includes("linkedin") ? linkedinVisibility : undefined,
        },
      } as any);
      if (mode === "publish") await publishNow({ postId });
      setContent("");
      setMedia([]);
      onSaved?.();
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save post.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-3" onMouseDown={onClose}>
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-zinc-700 bg-[#111] p-5 sm:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs uppercase tracking-widest text-zinc-600">Create post</p><h2 className="mt-1 text-xl font-semibold text-white">Publish across connected channels</h2></div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"><X size={18} /></button>
        </div>

        <textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write your post…" className="mt-5 min-h-40 w-full rounded-2xl border border-zinc-800 bg-black p-4 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600" />

        <div className="mt-4 flex flex-wrap gap-2">
          {CHANNELS.map((channel) => (
            <button key={channel} type="button" onClick={() => toggle(channel)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${channels.includes(channel) ? "border-white bg-white text-black" : "border-zinc-800 text-zinc-500"}`}>
              <SocialNetworkLogo channel={channel} size={14} />{channel === "x" ? "X" : channel[0].toUpperCase() + channel.slice(1)}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-sm font-semibold text-white">Media</p><p className="mt-1 text-xs text-zinc-600">Up to 10 images/videos.</p></div>
            <button type="button" onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200"><ImagePlus size={14} />Add media</button>
          </div>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(event) => { void upload(event.target.files); event.currentTarget.value = ""; }} />
          {media.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{media.map((item, index) => <button key={item.storageId} type="button" onClick={() => setMedia((current) => current.filter((_, i) => i !== index))} className="rounded-lg border border-zinc-800 px-3 py-2 text-xs text-zinc-400 hover:text-red-300">{item.name} ×</button>)}</div>}
        </div>

        {channels.includes("facebook") && <label className="mt-4 block text-xs text-zinc-400">Facebook Page<select value={facebookPageId} onChange={(event) => setFacebookPageId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="">Choose page</option>{facebookPages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}</select></label>}
        {channels.includes("instagram") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">Instagram account<select value={instagramUserId} onChange={(event) => setInstagramUserId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="">Choose account</option>{instagramTargets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs text-zinc-400">Format<select value={instagramPostType} onChange={(event) => setInstagramPostType(event.target.value as any)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="post">Post</option><option value="reel">Reel</option><option value="story">Story</option><option value="carousel">Carousel</option></select></label></div>}
        {channels.includes("youtube") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">YouTube title<input value={youtubeTitle} onChange={(event) => setYoutubeTitle(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white" /></label><label className="text-xs text-zinc-400">Privacy<select value={youtubePrivacy} onChange={(event) => setYoutubePrivacy(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></label></div>}
        {channels.includes("linkedin") && <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs text-zinc-400">LinkedIn author URN<input value={linkedinAuthorUrn} onChange={(event) => setLinkedinAuthorUrn(event.target.value)} placeholder="Optional company-page URN" className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white" /></label><label className="text-xs text-zinc-400">Visibility<select value={linkedinVisibility} onChange={(event) => setLinkedinVisibility(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="PUBLIC">Public</option><option value="CONNECTIONS">Connections</option></select></label></div>}

        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-800 bg-black/30 p-4">
          <button type="button" onClick={() => setMode("draft")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === "draft" ? "bg-white text-black" : "border border-zinc-800 text-zinc-400"}`}>Save draft</button>
          <button type="button" disabled={!canSchedule} onClick={() => setMode("schedule")} className={`rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-30 ${mode === "schedule" ? "bg-white text-black" : "border border-zinc-800 text-zinc-400"}`}>Schedule</button>
          <button type="button" onClick={() => setMode("publish")} className={`rounded-xl px-3 py-2 text-xs font-semibold ${mode === "publish" ? "bg-white text-black" : "border border-zinc-800 text-zinc-400"}`}>Publish now</button>
          {mode === "schedule" && <input type="datetime-local" value={scheduledFor} onChange={(event) => setScheduledFor(event.target.value)} className="ml-auto h-10 rounded-xl border border-zinc-800 bg-black px-3 text-xs text-white" />}
        </div>

        {error && <p className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-300">{error}</p>}

        <div className="mt-6 flex justify-end border-t border-zinc-800 pt-5">
          <button type="button" disabled={busy || !content.trim() || !channels.length} onClick={() => void save()} className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {mode === "publish" ? "Publish" : mode === "schedule" ? "Schedule" : "Save draft"}
          </button>
        </div>
      </div>
    </div>
  );
}
