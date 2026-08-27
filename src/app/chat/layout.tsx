"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CryzoLogo } from "@/components/CryzoLogo";
import { useAuth } from "@/providers/AuthProvider";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (isLoading || isAuthenticated) return;

    const next = pathname || "/chat";
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [isAuthenticated, isLoading, pathname, router]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh items-center justify-center bg-black">
        <div className="text-sm text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-black md:flex-row">
      <header className="flex h-14 shrink-0 items-center border-b border-zinc-800 bg-black px-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
        <CryzoLogo showWordmark className="ml-2 text-white" />
      </header>

      <div className="hidden h-full shrink-0 md:block">
        <Suspense
          fallback={<div className="h-full w-64 border-r border-zinc-800 bg-zinc-950" />}
        >
          <Sidebar />
        </Suspense>
      </div>

      <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</main>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] md:hidden">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
            aria-label="Close navigation"
          />
          <div className="absolute inset-y-0 left-0 w-[86vw] max-w-[340px] shadow-2xl">
            <Suspense fallback={<div className="h-full bg-[#f7f7f5]" />}>
              <Sidebar
                variant="mobile"
                onClose={() => setMobileMenuOpen(false)}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
