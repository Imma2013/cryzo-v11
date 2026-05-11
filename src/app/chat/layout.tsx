"use client";

import { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-black">
      <Suspense
        fallback={
          <div className="h-full w-64 border-r border-zinc-800 bg-zinc-950" />
        }
      >
        <Sidebar />
      </Suspense>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
