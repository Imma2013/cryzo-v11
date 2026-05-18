"use client";

import { Suspense, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { useRouter, useSearchParams } from "next/navigation";

function LoginContent() {
  const { isAuthenticated, isLoading, signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawNextRoute = searchParams.get("next");
  const nextRoute = rawNextRoute?.startsWith("/") ? rawNextRoute : "/chat";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !isLoading) {
    router.replace(nextRoute);
    return null;
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signIn("password", {
        email,
        password,
        flow: isSignUp ? "signUp" : "signIn",
      });
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    try {
      const result = await signIn("google", { redirectTo: nextRoute });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (err: any) {
      setError(err.message || "Google sign-in failed");
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white">Cryzo</h1>
        </div>

        <button
          onClick={handleGoogle}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
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
          Continue with Google
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-xs text-zinc-500">or</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
            minLength={6}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
          >
            {isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}

        <p className="text-center text-sm text-zinc-500">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-white hover:underline"
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
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
