"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/providers/AuthProvider";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    const next = pathname || "/chat";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [isAuthenticated, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-black">
      <div className="h-full shrink-0">
        <Suspense
          fallback={
            <div className="h-full w-14 border-r border-zinc-800 bg-zinc-950 md:w-64" />
          }
        >
          <Sidebar />
        </Suspense>
      </div>
      <main className="min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
