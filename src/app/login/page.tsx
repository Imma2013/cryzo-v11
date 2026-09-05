"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ThemeToggle } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";

type AuthMode = "signIn" | "signUp";

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
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.replace(nextRoute);
    }
  }, [isAuthenticated, isLoading, nextRoute, router]);

  const handleEmailAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const result = await signIn("password", {
        email: normalizedEmail,
        password,
        flow: mode,
      });

      if (!result?.signingIn) {
        setVerificationEmail(normalizedEmail);
        setNotice("We sent a 6-digit verification code to your email.");
      }
    } catch (authError) {
      setError(errorMessage(authError, "Authentication failed."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!verificationEmail) return;

    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      await signIn("password", {
        email: verificationEmail,
        code: verificationCode.trim(),
        flow: "email-verification",
      });
    } catch (authError) {
      setError(errorMessage(authError, "That verification code did not work."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!verificationEmail) return;

    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      await signIn("password", {
        email: verificationEmail,
        password,
        flow: "signIn",
      });
      setNotice("A new verification code is on its way.");
    } catch (authError) {
      setError(errorMessage(authError, "We could not resend the code."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setNotice("");
    setSubmitting(true);

    try {
      const result = await signIn("google", { redirectTo: nextRoute });
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (authError) {
      setError(errorMessage(authError, "Google sign-in failed."));
      setSubmitting(false);
    }
  };

  const changeMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setVerificationEmail(null);
    setVerificationCode("");
    setError("");
    setNotice("");
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
            {verificationEmail
              ? "Verify your email to activate your account"
              : mode === "signUp"
                ? "Create your account"
                : "Welcome back"}
          </p>
        </div>

        {verificationEmail ? (
          <form onSubmit={handleVerification} className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
              Enter the code sent to{" "}
              <span className="font-medium text-white">{verificationEmail}</span>.
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="6-digit code"
              required
              minLength={6}
              maxLength={6}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-lg tracking-[0.35em] text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting || verificationCode.length !== 6}
              className="w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
              {submitting ? "Verifying..." : "Verify email"}
            </button>
            <div className="flex items-center justify-center gap-3 text-sm">
              <button
                type="button"
                onClick={handleResend}
                disabled={submitting}
                className="text-zinc-400 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
              <span className="text-zinc-700">·</span>
              <button
                type="button"
                onClick={() => {
                  setVerificationEmail(null);
                  setVerificationCode("");
                  setError("");
                  setNotice("");
                }}
                disabled={submitting}
                className="text-zinc-400 underline-offset-4 hover:text-white hover:underline disabled:opacity-50"
              >
                Change email
              </button>
            </div>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogle}
              disabled={submitting || isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            >
              <GoogleMark />
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
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                autoComplete="email"
                required
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete={mode === "signUp" ? "new-password" : "current-password"}
                required
                minLength={8}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
              />
              {mode === "signUp" && (
                <p className="text-xs leading-5 text-zinc-500">
                  We’ll email you a verification code before activating the account.
                </p>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-white py-3 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
              >
                {submitting
                  ? mode === "signUp"
                    ? "Creating account..."
                    : "Signing in..."
                  : mode === "signUp"
                    ? "Create account"
                    : "Sign in"}
              </button>
            </form>

            <p className="text-center text-sm text-zinc-500">
              {mode === "signUp" ? "Already have an account?" : "New to Cryzo?"}{" "}
              <button
                type="button"
                onClick={() =>
                  changeMode(mode === "signUp" ? "signIn" : "signUp")
                }
                className="font-medium text-white underline-offset-4 hover:underline"
              >
                {mode === "signUp" ? "Sign in" : "Create an account"}
              </button>
            </p>
          </>
        )}

        <div aria-live="polite" className="min-h-5 text-center text-sm">
          {error && <p className="text-red-400">{error}</p>}
          {!error && notice && <p className="text-emerald-400">{notice}</p>}
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
