"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, RefreshCw } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { useAuth } from "@/providers/AuthProvider";

const ISOLATION_RELOAD_KEY = "cryzo:webcontainer-isolation-reload";

type IsolationState = "checking" | "ready" | "failed";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isolationState, setIsolationState] = useState<IsolationState>("checking");

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    const next = pathname || "/chat";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [isAuthenticated, isLoading, pathname, router]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || typeof window === "undefined") return;

    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(ISOLATION_RELOAD_KEY);
      setIsolationState("ready");
      return;
    }

    const currentUrl = `${window.location.pathname}${window.location.search}`;
    const previousReload = sessionStorage.getItem(ISOLATION_RELOAD_KEY);

    if (previousReload !== currentUrl) {
      sessionStorage.setItem(ISOLATION_RELOAD_KEY, currentUrl);
      window.location.reload();
      return;
    }

    setIsolationState("failed");
  }, [isAuthenticated, isLoading, pathname]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (isolationState === "checking") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--cryzo-canvas)] text-[var(--cryzo-text)]">
        <div className="flex items-center gap-3 text-sm text-[var(--cryzo-muted)]">
          <RefreshCw size={17} className="animate-spin text-[var(--cryzo-accent)]" />
          Preparing secure builder runtime...
        </div>
      </div>
    );
  }

  if (isolationState === "failed") {
    return (
      <div className="flex h-screen items-center justify-center bg-[var(--cryzo-canvas)] px-6 text-[var(--cryzo-text)]">
        <div className="max-w-md rounded-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-card)] p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold">Builder reload required</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--cryzo-muted)]">
            Cryzo could not enable the browser isolation required by WebContainers in this document.
            Reload the builder to start a fresh preview runtime.
          </p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem(ISOLATION_RELOAD_KEY);
              window.location.reload();
            }}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-full bg-[var(--cryzo-text)] px-4 text-sm font-medium text-[var(--cryzo-panel)]"
          >
            <RefreshCw size={15} /> Reload builder
          </button>
        </div>
      </div>
    );
  }

  const section =
    pathname === "/chat/marketing" || pathname === "/chat/social"
      ? "Marketing"
      : pathname.startsWith("/chat/apps")
        ? "Apps"
      : pathname === "/chat/billing"
        ? "Billing"
        : pathname === "/chat/cloud"
          ? "Cloud"
          : "Cryzo";
  const isConversationPage =
    /^\/chat\/[^/]+$/.test(pathname) &&
    pathname !== "/chat/social" &&
    pathname !== "/chat/marketing" &&
    !pathname.startsWith("/chat/apps") &&
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
