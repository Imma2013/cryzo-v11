"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { SocialNetworkLogo, type SocialNetwork } from "@/components/SocialNetworkLogo";

export type MarketingPost = {
  _id: string;
  content: string;
  channels: SocialNetwork[];
  scheduledFor: number;
  status: string;
  mediaUrls?: string[];
};

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function slotDate(day: Date, hour: number) {
  const value = new Date(day);
  value.setHours(hour, 0, 0, 0);
  return value;
}

function statusClass(status: string) {
  if (status === "published") return "border-emerald-500/30 bg-emerald-500/10";
  if (status === "failed") return "border-red-500/30 bg-red-500/10";
  if (status === "scheduled") return "border-blue-500/30 bg-blue-500/10";
  return "border-zinc-700 bg-zinc-900";
}

function PostCard({
  post,
  onOpen,
  draggable = true,
}: {
  post: MarketingPost;
  onOpen: (post: MarketingPost) => void;
  draggable?: boolean;
}) {
  return (
    <button
      type="button"
      draggable={draggable && !["published", "publishing"].includes(post.status)}
      onDragStart={(event) => {
        event.stopPropagation();
        event.dataTransfer.setData("text/cryzo-post-id", post._id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(post);
      }}
      className={`w-full rounded-lg border p-2 text-left shadow-sm transition hover:border-zinc-500 ${statusClass(post.status)}`}
    >
      <div className="flex items-center gap-1">
        {post.channels.slice(0, 3).map((channel) => (
          <SocialNetworkLogo key={channel} channel={channel} size={11} />
        ))}
        <span className="ml-auto text-[9px] uppercase tracking-wide text-zinc-500">{post.status}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-200">{post.content}</p>
    </button>
  );
}

export default function MarketingCalendar({
  posts,
  selectedChannel,
  onCreate,
  onOpenPost,
  onReschedule,
}: {
  posts: MarketingPost[];
  selectedChannel?: SocialNetwork | null;
  onCreate: (date: Date) => void;
  onOpenPost: (post: MarketingPost) => void;
  onReschedule: (postId: string, date: Date) => Promise<void> | void;
}) {
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchor, setAnchor] = useState(() => new Date());

  const visiblePosts = useMemo(
    () => selectedChannel ? posts.filter((post) => post.channels.includes(selectedChannel)) : posts,
    [posts, selectedChannel],
  );
  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, index) => index), []);
  const now = new Date();

  function postsAt(day: Date, hour?: number) {
    return visiblePosts.filter((post) => {
      const date = new Date(post.scheduledFor);
      return sameDay(date, day) && (hour === undefined || date.getHours() === hour);
    });
  }

  function shift(direction: number) {
    const next = new Date(anchor);
    if (view === "day") next.setDate(next.getDate() + direction);
    else if (view === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    setAnchor(next);
  }

  function drop(event: React.DragEvent, date: Date) {
    event.preventDefault();
    const postId = event.dataTransfer.getData("text/cryzo-post-id");
    if (postId) void onReschedule(postId, date);
  }

  const rangeLabel = view === "day"
    ? anchor.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    : view === "week"
      ? `${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${addDays(weekStart, 6).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthGridStart = startOfWeek(monthStart);
  const monthDays = Array.from({ length: 42 }, (_, index) => addDays(monthGridStart, index));

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <header className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => setAnchor(new Date())} className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-600">Today</button>
          <button type="button" onClick={() => shift(1)} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"><ChevronRight size={17} /></button>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{rangeLabel}</p>
          {selectedChannel && <p className="mt-0.5 text-[10px] uppercase tracking-widest text-zinc-600">Filtered to {selectedChannel}</p>}
        </div>
        <div className="flex items-center rounded-xl border border-zinc-800 bg-zinc-950 p-1">
          {(["day", "week", "month"] as const).map((item) => (
            <button key={item} type="button" onClick={() => setView(item)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${view === item ? "bg-white text-black" : "text-zinc-500 hover:text-white"}`}>{item}</button>
          ))}
        </div>
        <button type="button" onClick={() => onCreate(new Date())} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-zinc-200"><Plus size={14} />Create post</button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {view === "week" && (
          <div className="relative min-w-[1120px]">
            <div className="sticky top-0 z-30 grid grid-cols-[76px_repeat(7,minmax(145px,1fr))] border-b border-zinc-800 bg-[#0b0b0b]">
              <div className="h-16 border-r border-zinc-800" />
              {weekDays.map((day) => (
                <button key={day.toISOString()} type="button" onClick={() => { setAnchor(day); setView("day"); }} className={`h-16 border-r border-zinc-800 px-2 text-center last:border-r-0 ${sameDay(day, now) ? "bg-blue-500/5" : ""}`}>
                  <span className="block text-[10px] uppercase tracking-widest text-zinc-600">{day.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className={`mt-1 inline-grid h-7 min-w-7 place-items-center rounded-full text-sm font-semibold ${sameDay(day, now) ? "bg-white text-black" : "text-zinc-300"}`}>{day.getDate()}</span>
                </button>
              ))}
            </div>

            <div className="relative grid grid-cols-[76px_repeat(7,minmax(145px,1fr))]">
              {hours.flatMap((hour) => [
                <div key={`label-${hour}`} className="h-[72px] border-b border-r border-zinc-800 pr-3 pt-2 text-right text-[10px] text-zinc-600">
                  {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}
                </div>,
                ...weekDays.map((day) => {
                  const date = slotDate(day, hour);
                  return (
                    <div
                      key={`${day.toISOString()}-${hour}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => drop(event, date)}
                      onDoubleClick={() => onCreate(date)}
                      className={`h-[72px] overflow-hidden border-b border-r border-zinc-800 p-1 last:border-r-0 hover:bg-zinc-950 ${sameDay(day, now) ? "bg-white/[0.01]" : ""}`}
                    >
                      <div className="space-y-1">{postsAt(day, hour).slice(0, 2).map((post) => <PostCard key={post._id} post={post} onOpen={onOpenPost} />)}</div>
                    </div>
                  );
                }),
              ])}
              {weekDays.some((day) => sameDay(day, now)) && (
                <div
                  className="pointer-events-none absolute left-[76px] right-0 z-20 h-px bg-red-500"
                  style={{ top: `${now.getHours() * 72 + (now.getMinutes() / 60) * 72}px` }}
                >
                  <span className="absolute -left-[7px] -top-[3px] h-2 w-2 rounded-full bg-red-500" />
                </div>
              )}
            </div>
          </div>
        )}

        {view === "day" && (
          <div className="min-w-[520px]">
            {hours.map((hour) => {
              const date = slotDate(anchor, hour);
              return (
                <div key={hour} className="grid grid-cols-[76px_1fr]">
                  <div className="h-[82px] border-b border-r border-zinc-800 pr-3 pt-2 text-right text-[10px] text-zinc-600">
                    {new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: "numeric" })}
                  </div>
                  <div
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => drop(event, date)}
                    onDoubleClick={() => onCreate(date)}
                    className="min-h-[82px] border-b border-zinc-800 p-2 hover:bg-zinc-950"
                  >
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {postsAt(anchor, hour).map((post) => <PostCard key={post._id} post={post} onOpen={onOpenPost} />)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {view === "month" && (
          <div className="grid min-w-[920px] grid-cols-7 border-l border-t border-zinc-800">
            {monthDays.map((day) => (
              <div
                key={day.toISOString()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => drop(event, slotDate(day, 9))}
                onDoubleClick={() => onCreate(slotDate(day, 9))}
                className={`min-h-[150px] border-b border-r border-zinc-800 p-2 ${day.getMonth() === anchor.getMonth() ? "bg-black" : "bg-zinc-950/50 opacity-50"}`}
              >
                <button type="button" onClick={() => { setAnchor(day); setView("day"); }} className={`mb-2 grid h-7 min-w-7 place-items-center rounded-full text-xs font-semibold ${sameDay(day, now) ? "bg-white text-black" : "text-zinc-500"}`}>{day.getDate()}</button>
                <div className="space-y-1.5">{postsAt(day).slice(0, 4).map((post) => <PostCard key={post._id} post={post} onOpen={onOpenPost} draggable={false} />)}</div>
                {postsAt(day).length > 4 && <p className="mt-1 text-[10px] text-zinc-600">+{postsAt(day).length - 4} more</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-900 px-4 py-2 text-[10px] text-zinc-700">
        Double-click an empty time slot to create. Drag scheduled posts to move them.
      </div>
    </div>
  );
}
