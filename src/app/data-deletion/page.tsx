import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "Data Deletion | Cryzo",
  description: "How to delete the data Cryzo stores for connected social accounts.",
};

const CONTACT_EMAIL = "lloyd.ebnchenge@gmail.com";

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-[var(--cryzo-canvas)] text-[var(--cryzo-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--cryzo-border)] bg-[color:var(--cryzo-canvas)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span>Cryzo</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/privacy" className="rounded-lg px-3 py-2 text-sm text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]">
              Privacy
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--cryzo-accent)]">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Data deletion</h1>
        <div className="mt-8 space-y-6 text-sm leading-7 text-[var(--cryzo-muted)] sm:text-[15px]">
          <p>Cryzo stores data for the social accounts you connect in Cryzo desktop Marketing (X, LinkedIn, YouTube, TikTok, Facebook, Instagram, and Reddit): encrypted access tokens, your account and Page names, posts you create or schedule, media you upload, and cached analytics.</p>
          <h2 className="pt-2 text-xl font-semibold tracking-tight text-[var(--cryzo-text)]">Delete it yourself</h2>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open Cryzo desktop and go to Marketing &gt; Channels.</li>
            <li>Open the account&apos;s menu and choose Disconnect. Its stored tokens are deleted immediately.</li>
            <li>Delete any posts in Social posts and any files in Media that you no longer want kept.</li>
          </ol>
          <p>You can also remove Cryzo&apos;s access from the network itself, for example in Facebook under Settings &gt; Apps and Websites, in Instagram under Settings &gt; Apps and websites, or in your Google account permissions. This stops Cryzo from using the connection; the data Cryzo already stored is removed when you disconnect in Cryzo or ask us to delete it.</p>
          <h2 className="pt-2 text-xl font-semibold tracking-tight text-[var(--cryzo-text)]">Ask us to delete it</h2>
          <p>Email <a href={`mailto:${CONTACT_EMAIL}?subject=Cryzo%20data%20deletion`} className="text-[var(--cryzo-text)] underline underline-offset-4">{CONTACT_EMAIL}</a> from the email address you use to sign in to Cryzo, with the subject &quot;Cryzo data deletion&quot;. We delete your Marketing data, including tokens, posts, media, and analytics, within 30 days and confirm by email. See our <Link href="/privacy" className="text-[var(--cryzo-text)] underline underline-offset-4">Privacy Policy</Link> for details.</p>
        </div>
      </article>
    </main>
  );
}
