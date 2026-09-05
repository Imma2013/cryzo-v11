"use client";

import Image from "next/image";

export type SocialPreviewChannel =
  | "x"
  | "linkedin"
  | "reddit"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook";

export type SocialPreviewMedia = {
  url: string;
  type?: string;
};

const PLATFORM = {
  x: { name: "X", mark: "X", accent: "bg-black text-white", action: "Reply · Repost · Like · Share" },
  linkedin: { name: "LinkedIn", mark: "in", accent: "bg-[#0a66c2] text-white", action: "Like · Comment · Repost · Send" },
  reddit: { name: "Reddit", mark: "r/", accent: "bg-[#ff4500] text-white", action: "Vote · Comment · Share" },
  youtube: { name: "YouTube", mark: "▶", accent: "bg-[#ff0033] text-white", action: "Like · Share · Subscribe" },
  tiktok: { name: "TikTok", mark: "♪", accent: "bg-black text-white ring-1 ring-zinc-700", action: "Like · Comment · Share" },
  instagram: { name: "Instagram", mark: "◎", accent: "bg-gradient-to-br from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white", action: "Like · Comment · Send · Save" },
  facebook: { name: "Facebook", mark: "f", accent: "bg-[#1877f2] text-white", action: "Like · Comment · Share" },
} satisfies Record<SocialPreviewChannel, {
  name: string;
  mark: string;
  accent: string;
  action: string;
}>;

function isVideo(media: SocialPreviewMedia) {
  return media.type?.startsWith("video/") || /\.(mp4|mov|webm)(\?|$)/i.test(media.url);
}

export default function SocialPostPreview({
  channel,
  content,
  title,
  accountName = "Your account",
  media = [],
  compact = false,
}: {
  channel: SocialPreviewChannel;
  content: string;
  title?: string;
  accountName?: string;
  media?: SocialPreviewMedia[];
  compact?: boolean;
}) {
  const platform = PLATFORM[channel];
  const firstMedia = media[0];

  return (
    <article
      className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-950 shadow-sm ${
        compact ? "text-[11px]" : "text-sm"
      }`}
      aria-label={`${platform.name} post preview`}
    >
      <header className="flex items-center gap-2.5 p-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold ${platform.accent}`}>
          {platform.mark}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{accountName}</p>
          <p className="text-[10px] text-zinc-500">{platform.name} · Just now</p>
        </div>
        <span className="text-zinc-400">•••</span>
      </header>

      {(title || content) && (
        <div className={compact ? "px-3 pb-3" : "px-4 pb-4"}>
          {title && <h3 className="mb-1 font-semibold">{title}</h3>}
          <p className={`whitespace-pre-wrap leading-relaxed ${compact ? "line-clamp-4" : "line-clamp-6"}`}>
            {content || "Your post preview will appear here."}
          </p>
        </div>
      )}

      {firstMedia && (
        <div className={`relative w-full bg-zinc-100 ${channel === "instagram" || channel === "tiktok" ? "aspect-square" : "aspect-video"}`}>
          {isVideo(firstMedia) ? (
            <video
              src={firstMedia.url}
              controls={!compact}
              muted
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <Image
              src={firstMedia.url}
              alt=""
              fill
              unoptimized
              sizes={compact ? "220px" : "(max-width: 768px) 100vw, 420px"}
              className="object-cover"
            />
          )}
          {media.length > 1 && (
            <span className="absolute right-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[10px] font-semibold text-white">
              +{media.length - 1}
            </span>
          )}
        </div>
      )}

      {!compact && (
        <footer className="border-t border-zinc-100 px-4 py-3 text-[11px] font-medium text-zinc-500">
          {platform.action}
        </footer>
      )}
    </article>
  );
}
