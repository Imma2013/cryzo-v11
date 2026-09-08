import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "Privacy Policy | Cryzo",
  description: "How Cryzo collects, uses, and protects information.",
};

const CONTACT_EMAIL = "lloyd.ebncheneg@gmail.com";
const UPDATED = "September 8, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-[var(--cryzo-border)] pt-8">
      <h2 className="text-xl font-semibold tracking-tight text-[var(--cryzo-text)] sm:text-2xl">
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-[var(--cryzo-muted)] sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

function BulletList({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-[var(--cryzo-muted)]">{children}</ul>;
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--cryzo-canvas)] text-[var(--cryzo-text)]">
      <header className="sticky top-0 z-20 border-b border-[var(--cryzo-border)] bg-[color:var(--cryzo-canvas)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
            <span>Cryzo</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/terms" className="rounded-lg px-3 py-2 text-sm text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]">
              Terms
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--cryzo-accent)]">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm text-[var(--cryzo-muted)]">Last updated and effective: {UPDATED}</p>
          <p className="mt-6 text-base leading-8 text-[var(--cryzo-muted)]">
            This Privacy Policy explains how Cryzo ("Cryzo," "we," "us," or "our") collects, uses, stores, and shares information when you use cryzo.me and the Cryzo software, AI builder, cloud features, deployment tools, integrations, and related services (the "Services").
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--cryzo-muted)]">
            By using the Services, you acknowledge this Policy and our <Link href="/terms" className="text-[var(--cryzo-text)] underline underline-offset-4">Terms of Service</Link>.
          </p>
        </div>

        <div className="mt-12 space-y-10">
          <Section title="1. Information we collect">
            <p>We collect information you provide, information created through your use of Cryzo, and limited technical information needed to operate and secure the Services.</p>
            <BulletList>
              <li><strong className="text-[var(--cryzo-text)]">Account information:</strong> information associated with sign-in, such as your name, email address, user identifier, profile image if provided by your sign-in provider, and authentication/session data.</li>
              <li><strong className="text-[var(--cryzo-text)]">Project and workspace data:</strong> prompts, chat messages, source code, generated files, images you upload, project settings, deployment configuration, database or authentication configuration, and other content you choose to store in Cryzo.</li>
              <li><strong className="text-[var(--cryzo-text)]">Billing information:</strong> subscription plan, purchases, credit balances, transaction identifiers, and billing status. Payment-card details are handled by our payment processor and are not intended to be stored directly by Cryzo.</li>
              <li><strong className="text-[var(--cryzo-text)]">Integration data:</strong> connection status, provider identifiers, OAuth permissions, repository or deployment metadata, MCP server details, and information returned by connected services when you ask Cryzo to use them.</li>
              <li><strong className="text-[var(--cryzo-text)]">Technical and usage information:</strong> browser and device information, IP address, timestamps, request and error logs, feature usage, model/provider selections, security events, and operational telemetry needed to run, debug, protect, and improve Cryzo.</li>
            </BulletList>
          </Section>

          <Section title="2. API keys and credentials">
            <p>Cryzo supports bring-your-own-key AI providers and other connected services. If you choose device-only storage, supported credentials may remain in browser storage on that device. If you choose to save a supported provider key to your Cryzo account, Cryzo encrypts the secret before storing it in the account-backed credential system.</p>
            <p>We use saved credentials only to perform actions you request, test a connection, or maintain the connected feature. You should revoke or replace credentials if you believe they have been exposed.</p>
          </Section>

          <Section title="3. How we use information">
            <p>We may use information for the following purposes:</p>
            <BulletList>
              <li>provide, operate, maintain, and secure the Services;</li>
              <li>authenticate users and preserve projects, conversations, settings, and account state;</li>
              <li>generate AI responses, code, edits, and other outputs you request;</li>
              <li>run previews, imports, publishing, mobile, integration, and connector workflows;</li>
              <li>process subscriptions, credits, payments, refunds where applicable, and billing support;</li>
              <li>detect abuse, fraud, security incidents, outages, and technical problems;</li>
              <li>measure reliability and improve product performance and user experience;</li>
              <li>communicate with you about account, security, billing, legal, or product matters; and</li>
              <li>comply with law and enforce our Terms.</li>
            </BulletList>
          </Section>

          <Section title="4. AI processing and model providers">
            <p>When you use AI features, prompts, relevant project context, attachments, and other information needed for the request may be sent to an AI provider. Cryzo-managed models may be routed through providers or model gateways selected by Cryzo. BYOK requests are sent using the provider configuration you select.</p>
            <p>Cryzo does not use your identifiable project content to train a Cryzo-owned general-purpose AI model unless we first obtain your affirmative permission. Third-party AI providers may process requests under their own terms and privacy policies, which can differ by provider, account type, and configuration.</p>
            <p>If you use a local or browser-accessible model, some processing may occur on infrastructure you control rather than on Cryzo&apos;s servers.</p>
          </Section>

          <Section title="5. Browser previews and project execution">
            <p>For supported web projects, some development and preview execution can occur inside a browser-based WebContainer environment. That means portions of source-code execution, dependency installation, preview rendering, and terminal activity may happen locally in your browser session.</p>
            <p>Project artifacts, account state, conversations, and other persistent service data may still be stored or synchronized through Cryzo&apos;s backend systems so you can return to your work later.</p>
          </Section>

          <Section title="6. Third-party services and subprocessors">
            <p>Cryzo relies on third parties to provide parts of the Services. Depending on which features you use, these may include:</p>
            <BulletList>
              <li><strong className="text-[var(--cryzo-text)]">Vercel</strong> for hosting and deployment infrastructure;</li>
              <li><strong className="text-[var(--cryzo-text)]">Convex</strong> for application data, authentication-related backend services, and persistent project/account state;</li>
              <li><strong className="text-[var(--cryzo-text)]">Stripe</strong> for payment processing and subscription billing;</li>
              <li><strong className="text-[var(--cryzo-text)]">GitHub</strong> when you connect repositories or use source-control workflows;</li>
              <li><strong className="text-[var(--cryzo-text)]">Netlify, Expo/EAS, app stores, or similar deployment/build services</strong> when you explicitly use those publishing workflows;</li>
              <li><strong className="text-[var(--cryzo-text)]">Composio, MCP servers, and other connector providers</strong> when you choose to connect external apps or tools; and</li>
              <li><strong className="text-[var(--cryzo-text)]">AI model providers and gateways</strong> such as OpenRouter, OpenAI, Anthropic, Google, xAI, NVIDIA, Groq, DeepSeek, Mistral, Together AI, Cerebras, Moonshot, or other providers supported by Cryzo.</li>
            </BulletList>
            <p>These providers process information according to their own terms, our agreements with them where applicable, and the permissions you grant. The exact providers involved depend on the feature, model, integration, or deployment path you choose.</p>
          </Section>

          <Section title="7. MCP servers and connected accounts">
            <p>When you connect an MCP server or third-party account, Cryzo may send requests, context, or parameters to that service and receive tool definitions, results, files, or other information back. We process only what is necessary to provide the action you request and maintain the connection.</p>
            <p>MCP servers can be operated by third parties outside Cryzo. You should review the server&apos;s operator, permissions, and privacy practices before connecting it. Data sent to a third-party MCP server is subject to that server operator&apos;s practices.</p>
          </Section>

          <Section title="8. Payments">
            <p>When you purchase a plan or credits, payment information is processed by Stripe or another payment provider we may designate. Cryzo receives information such as payment status, plan, transaction identifiers, billing email, and other information needed to manage your subscription, but we do not need to store your full card number.</p>
          </Section>

          <Section title="9. Cookies, browser storage, and similar technologies">
            <p>Cryzo uses browser storage, cookies, and similar technologies where needed for sign-in, session management, security, theme preferences, device-level API-key preferences, product state, and other core functionality.</p>
            <p>We may also use limited analytics or diagnostics to understand reliability and feature usage. If we later add non-essential advertising or marketing tracking that legally requires consent, we will provide appropriate controls before using it where required.</p>
          </Section>

          <Section title="10. When we share information">
            <p>We do not sell your personal information. We may disclose information:</p>
            <BulletList>
              <li>to service providers and subprocessors that help operate Cryzo;</li>
              <li>to AI providers, deployment platforms, repositories, MCP servers, and integrations when needed to perform an action you request;</li>
              <li>to comply with law, valid legal process, or government requests;</li>
              <li>to protect Cryzo, our users, or others from fraud, abuse, security threats, or unlawful activity;</li>
              <li>as part of a merger, financing, acquisition, reorganization, sale of assets, or similar business transaction; or</li>
              <li>with your consent or at your direction.</li>
            </BulletList>
          </Section>

          <Section title="11. Data retention and deletion">
            <p>We retain information for as long as reasonably necessary to provide the Services, maintain your account and projects, process billing, resolve disputes, prevent abuse, meet legal obligations, and protect the Services.</p>
            <p>When information is no longer needed, we may delete or de-identify it. Backup, security, fraud-prevention, and legal records may remain for a limited additional period where reasonably necessary or required by law.</p>
            <p>You may request account or personal-data deletion by contacting us at the email below. Some project data may also be removable through product controls as those features are available.</p>
          </Section>

          <Section title="12. Security">
            <p>We use reasonable technical and organizational safeguards designed to protect information, including encrypted transport, access controls, authentication protections, and encrypted storage for supported account-saved provider secrets.</p>
            <p>No online service can guarantee absolute security. You are responsible for securing your own devices, API keys, connected accounts, repositories, deployed applications, and any secrets you place in project code.</p>
          </Section>

          <Section title="13. Your privacy choices and rights">
            <p>Depending on where you live, you may have rights to request access to, correction of, deletion of, or a copy of personal information we hold about you, or to object to or restrict certain processing.</p>
            <p>To make a privacy request, email <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--cryzo-text)] underline underline-offset-4">{CONTACT_EMAIL}</a>. We may need to verify your identity before completing a request. We will respond within the period required by applicable law.</p>
          </Section>

          <Section title="14. International processing">
            <p>Cryzo and its providers may process information in the United States and other countries. Those countries may have privacy laws that differ from the laws where you live. Where required, we will use legally recognized mechanisms for international data transfers.</p>
          </Section>

          <Section title="15. Children">
            <p>The Services are not intended for children under 18. We do not knowingly collect personal information from children under 18 through the standard Cryzo service. If you believe a child has provided personal information to Cryzo, contact us so we can review and address the issue.</p>
          </Section>

          <Section title="16. Changes to this Policy">
            <p>We may update this Policy as Cryzo, our providers, or applicable laws change. We will update the date at the top of this page and provide additional notice for material changes when required by law.</p>
          </Section>

          <Section title="17. Contact">
            <p>For privacy questions, requests, or concerns, contact Cryzo at <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--cryzo-text)] underline underline-offset-4">{CONTACT_EMAIL}</a>.</p>
          </Section>
        </div>
      </article>

      <footer className="border-t border-[var(--cryzo-border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-[var(--cryzo-muted)] sm:px-8">
          <span>© 2026 Cryzo</span>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[var(--cryzo-text)]">Terms</Link>
            <Link href="/privacy" className="text-[var(--cryzo-text)]">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
