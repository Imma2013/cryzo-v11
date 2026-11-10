import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "Download | Cryzo",
  description: "Download Cryzo Desktop for Windows.",
};

const WINDOWS_ZIP =
  "https://github.com/Imma2013/cryzo-desktop/releases/download/v0.1.0-preview/Cryzo-Desktop-Windows-x64.zip";

export default function DownloadPage() {
  return (
    <main className="min-h-screen bg-[var(--cryzo-canvas)] text-[var(--cryzo-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--cryzo-border)] bg-[color:var(--cryzo-canvas)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span>Cryzo</span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Download Cryzo Desktop</h1>
        <p className="mt-4 text-base leading-8 text-[var(--cryzo-muted)]">
          Plan, schedule, and publish your own posts to X, LinkedIn, YouTube, TikTok, Facebook Pages, and Instagram from one desktop app.
        </p>

        <a
          href={WINDOWS_ZIP}
          className="mt-8 inline-flex h-11 items-center rounded-lg bg-[var(--cryzo-text)] px-5 text-sm font-medium text-[var(--cryzo-canvas)] hover:opacity-90"
        >
          Download for Windows (64-bit)
        </a>
        <p className="mt-3 text-xs text-[var(--cryzo-muted)]">Preview build · Windows 10 or 11 · macOS coming soon</p>

        <section className="mt-12 border-t border-[var(--cryzo-border)] pt-8">
          <h2 className="text-xl font-semibold">Install</h2>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-7 text-[var(--cryzo-muted)] sm:text-[15px]">
            <li>Unzip the download, open the Cryzo folder, and run Cryzo.exe.</li>
            <li>
              The preview is not code-signed yet, so Windows SmartScreen may show &quot;Windows protected your PC&quot;. Click
              More info, then Run anyway.
            </li>
            <li>Sign in with Google, then open Marketing to connect your accounts.</li>
          </ol>
        </section>
      </article>

      <footer className="border-t border-[var(--cryzo-border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-[var(--cryzo-muted)] sm:px-8">
          <span>© 2026 Cryzo, a product of Tenacious Finance LLC</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[var(--cryzo-text)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--cryzo-text)]">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
