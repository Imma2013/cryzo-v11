"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
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
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  const section =
    pathname === "/chat/apps"
      ? "Apps"
      : pathname === "/chat/billing"
        ? "Billing"
        : pathname === "/chat/cloud"
          ? "Cloud"
          : "Cryzo";
  const isConversationPage =
    /^\/chat\/[^/]+$/.test(pathname) &&
    pathname !== "/chat/apps" &&
    pathname !== "/chat/billing" &&
    pathname !== "/chat/cloud";

  const openSidebar = () => {
    window.dispatchEvent(new Event("cryzo:open-sidebar"));
  };

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-black">
      <Suspense
        fallback={
          <div className="hidden h-full w-64 border-r border-zinc-800 bg-zinc-950 md:block" />
        }
      >
        <Sidebar />
      </Suspense>
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isConversationPage && (
          <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-800 bg-[#111113] px-4 md:hidden">
            <button
              type="button"
              onClick={openSidebar}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-200 transition-colors hover:bg-zinc-800"
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <div className="truncate text-base font-semibold text-white">{section}</div>
          </header>
        )}
        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
      </main>
    </div>
  );
}
