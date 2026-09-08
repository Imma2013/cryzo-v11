"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function GoogleMark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function LoginContent() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNextRoute = searchParams.get("next");
  const nextRoute = rawNextRoute?.startsWith("/") ? rawNextRoute : "/chat";
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(nextRoute);
    }
  }, [isAuthenticated, isLoading, nextRoute, router]);

  const handleGoogle = async () => {
    setError("");
    setSubmitting(true);

    try {
      const result = await signIn("google", { redirectTo: nextRoute });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
        return;
      }
      setSubmitting(false);
    } catch (authError) {
      setError(errorMessage(authError, "Google sign-in failed."));
      setSubmitting(false);
    }
  };

  if (isLoading || isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-black p-4">
      <ThemeToggle className="absolute right-5 top-5 border border-zinc-800" />

      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Cryzo</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Sign in or create your account with Google
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={submitting || isLoading}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          <GoogleMark />
          {submitting ? "Connecting to Google..." : "Continue with Google"}
        </button>

        <div aria-live="polite" className="min-h-5 text-center text-sm">
          {error && <p className="text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-black">
          <div className="text-zinc-400">Loading...</div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
