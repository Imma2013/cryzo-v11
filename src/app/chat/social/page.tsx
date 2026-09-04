"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function LegacySocialPage() {
  const posts = useQuery(api.social.listPosts, {});
  return <main className="p-8 text-white"><h1 className="text-2xl font-semibold">Marketing is now inside your project</h1><p className="mt-3 text-zinc-400">Open a project, choose Dashboard, then Marketing. Your previous drafts are preserved below.</p><Link className="mt-4 inline-block underline" href="/chat">Open projects</Link><div className="mt-8 space-y-3">{posts?.map(post => <article key={post._id} className="rounded-xl border border-zinc-800 p-4"><p className="whitespace-pre-wrap">{post.content}</p><p className="mt-2 text-xs text-zinc-500">{post.status} · Legacy post</p></article>)}</div></main>;
}

