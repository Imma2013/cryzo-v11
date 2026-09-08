import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "Terms of Service | Cryzo",
  description: "Terms governing use of Cryzo and cryzo.me.",
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

export default function TermsPage() {
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

      <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--cryzo-accent)]">Legal</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Terms of Service</h1>
          <p className="mt-4 text-sm text-[var(--cryzo-muted)]">Last updated and effective: {UPDATED}</p>
          <p className="mt-6 text-base leading-8 text-[var(--cryzo-muted)]">
            These Terms of Service ("Terms") govern your access to and use of cryzo.me and the Cryzo software, AI builder, browser workspace, cloud features, publishing tools, integrations, connectors, and related services (collectively, the "Services"). For these Terms, "Cryzo," "we," "us," and "our" mean the operator of the Services.
          </p>
          <p className="mt-4 text-base leading-8 text-[var(--cryzo-muted)]">
            By creating an account, clicking to continue, or using the Services, you agree to these Terms and our <Link href="/privacy" className="text-[var(--cryzo-text)] underline underline-offset-4">Privacy Policy</Link>. If you do not agree, do not use the Services.
          </p>
        </div>

        <div className="mt-12 space-y-10">
          <Section title="1. Eligibility and accounts">
            <p>You must be at least 18 years old, or the age of majority where you live, to use the Services. If you use Cryzo on behalf of a business or organization, you represent that you have authority to bind that entity to these Terms.</p>
            <p>You are responsible for keeping your account and credentials secure, for activity performed through your account, and for keeping your account information accurate. Notify us promptly if you believe your account has been compromised.</p>
          </Section>

          <Section title="2. What Cryzo provides">
            <p>Cryzo is an AI-assisted software builder that can help you create, edit, preview, connect, publish, and manage web and native application projects. Features may include managed AI models, bring-your-own-key (BYOK) models, browser-based development environments, project storage, authentication and database features, GitHub synchronization, deployment workflows, native mobile source generation, App Store and Google Play readiness workflows, MCP servers, and third-party app connectors.</p>
            <p>Some execution and preview activity may happen locally in your browser, while account, project, billing, integration, and other service data may be processed by Cryzo and its service providers.</p>
          </Section>

          <Section title="3. License to use the Services">
            <p>Subject to these Terms, we grant you a limited, non-exclusive, non-transferable, revocable right to access and use the hosted Services for your personal or business purposes, including to build and operate applications for your own users.</p>
            <p>This hosted-service license does not transfer ownership of Cryzo itself. Code that Cryzo separately publishes under an open-source license remains governed by that license, and nothing in these Terms takes away rights expressly granted by that open-source license.</p>
          </Section>

          <Section title="4. Acceptable use">
            <p>You may not use the Services to break the law, violate another person&apos;s rights, distribute malware, bypass security or usage controls, interfere with the Services, gain unauthorized access to systems or data, harass or impersonate others, facilitate fraud, or generate or distribute unlawful or infringing material.</p>
            <p>You may not resell access to the hosted Cryzo service as your own service without our permission, abuse automated access, intentionally overload Cryzo or its providers, or use the Services in a way that creates unreasonable security, infrastructure, or legal risk.</p>
            <p>You are responsible for the applications you build and for ensuring that your applications comply with applicable laws, app-store rules, third-party terms, privacy obligations, and any promises you make to your own users.</p>
          </Section>

          <Section title="5. Your projects, content, and ownership">
            <p>"Customer Data" means prompts, messages, source code, files, images, project data, deployment settings, and other material you submit to or create through the Services. As between you and Cryzo, you retain ownership of your Customer Data and the applications and projects you build, subject to third-party rights and applicable law.</p>
            <p>You grant Cryzo a limited worldwide license to host, copy, transmit, process, modify, and display Customer Data only as reasonably necessary to provide, secure, troubleshoot, maintain, and improve the Services, comply with law, or carry out actions you request.</p>
            <p>Cryzo does not claim ownership of your application merely because you built it with Cryzo. AI-generated output may not be unique and may be subject to third-party rights or provider-specific terms.</p>
          </Section>

          <Section title="6. AI models and BYOK">
            <p>The Services can route requests to third-party AI providers. Managed Cryzo models may be accessed through Cryzo&apos;s infrastructure, while BYOK lets you connect credentials for a supported provider. When you use BYOK, you are also subject to that provider&apos;s terms, pricing, usage limits, and data practices.</p>
            <p>You are responsible for charges imposed by providers connected with your own API keys. Cryzo message credits are not intended to represent or replace the balance held with a BYOK provider.</p>
            <p>AI output can be wrong, incomplete, insecure, or unsuitable. You must review and test generated code and content before relying on it, especially for medical, legal, financial, security-sensitive, or safety-critical uses.</p>
          </Section>

          <Section title="7. MCP servers, integrations, and connected accounts">
            <p>If you connect an MCP server, OAuth account, API integration, repository, deployment provider, or other third-party service, you authorize Cryzo to send requests to and receive information from that service within the permissions you grant.</p>
            <p>You are responsible for selecting trusted servers and integrations, reviewing requested permissions, and complying with the third party&apos;s terms. Cryzo is not responsible for actions, outages, data practices, or charges caused by third-party services you choose to connect.</p>
          </Section>

          <Section title="8. Publishing, hosting, and mobile apps">
            <p>Cryzo may help you deploy to Cryzo-managed hosting or providers you connect, such as source-control, web-hosting, or mobile-build services. Availability, quotas, and managed compute limits may vary by feature and plan.</p>
            <p>Cryzo does not charge a separate platform fee merely for access to generated native source or the store-readiness/submission workflow. You remain responsible for third-party costs such as Apple Developer Program fees, Google Play fees, hosting charges, domain fees, build-provider fees, or other external costs that may apply.</p>
            <p>Approval by Apple, Google, hosting providers, registrars, or other third parties is not guaranteed. Those providers control their own review standards and policies.</p>
          </Section>

          <Section title="9. Subscriptions, credits, and payments">
            <p>Cryzo may offer free and paid plans. Paid subscriptions may be billed monthly or annually and may renew automatically until canceled. Current prices, included message credits, integration credits, and plan features are shown in the product&apos;s billing interface or other pricing materials.</p>
            <p>Credits are service-usage units, not cash, stored value, currency, or a financial instrument. Except where required by law, subscriptions, consumed credits, and credit purchases are non-refundable. Free or promotional credits may be subject to additional limits or expiration rules.</p>
            <p>Payments are processed by third-party payment providers such as Stripe. You authorize those providers and Cryzo to process charges you initiate and any applicable recurring subscription payments. You are responsible for applicable taxes and fees not already included in the price.</p>
          </Section>

          <Section title="10. Service availability and experimental features">
            <p>Cryzo depends on browsers, hosting providers, AI providers, payment systems, databases, build services, and other third parties. Interruptions, provider outages, model failures, API changes, rate limits, or other errors may occur.</p>
            <p>Features identified as beta, preview, experimental, free, or early access may change, become unavailable, or be removed at any time. We do not guarantee uninterrupted availability or that any specific model, integration, or provider will remain available.</p>
          </Section>

          <Section title="11. Suspension and termination">
            <p>You may stop using Cryzo at any time. We may suspend or terminate access if we reasonably believe you materially violated these Terms, engaged in fraud or abuse, created a security risk, failed to pay amounts due, or if suspension is required by law or a third-party provider.</p>
            <p>On termination, your right to access the hosted Services ends. You remain responsible for charges incurred before termination. We may retain certain information when required for security, fraud prevention, legal compliance, billing, or dispute resolution, as described in our Privacy Policy.</p>
          </Section>

          <Section title="12. Intellectual property and feedback">
            <p>Cryzo and its licensors retain rights in the hosted Service, branding, interfaces, proprietary software, documentation, and technology, excluding your Customer Data and rights granted under separate open-source licenses.</p>
            <p>If you send us feedback, ideas, or suggestions about Cryzo, you grant us permission to use them without restriction or compensation, unless we agree otherwise in writing.</p>
          </Section>

          <Section title="13. Disclaimers">
            <p className="font-medium text-[var(--cryzo-text)]">THE SERVICES AND AI OUTPUT ARE PROVIDED "AS IS" AND "AS AVAILABLE" TO THE FULLEST EXTENT PERMITTED BY LAW. WE DISCLAIM IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTY THAT THE SERVICES WILL BE ERROR-FREE, SECURE, UNINTERRUPTED, OR PRODUCE A PARTICULAR RESULT.</p>
            <p>You are responsible for reviewing backups, testing generated code, securing applications you deploy, and determining whether the Services and any AI output are appropriate for your use case.</p>
          </Section>

          <Section title="14. Limitation of liability">
            <p className="font-medium text-[var(--cryzo-text)]">TO THE FULLEST EXTENT PERMITTED BY LAW, CRYZO AND ITS SERVICE PROVIDERS WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, LOST DATA, LOST BUSINESS, OR BUSINESS INTERRUPTION ARISING FROM THE SERVICES.</p>
            <p>To the fullest extent permitted by law, Cryzo&apos;s total liability for claims arising from the Services or these Terms will not exceed the amount you paid Cryzo during the twelve months immediately before the event giving rise to the claim. Nothing here limits liability that cannot legally be limited.</p>
          </Section>

          <Section title="15. Indemnification">
            <p>To the extent permitted by law, you agree to defend, indemnify, and hold Cryzo harmless from third-party claims, losses, liabilities, and reasonable costs arising from your applications, Customer Data, misuse of the Services, violation of these Terms, violation of law, or violation of a third party&apos;s rights or provider terms.</p>
          </Section>

          <Section title="16. Governing law">
            <p>These Terms are governed by the laws of the State of Texas, United States, without regard to conflict-of-law principles, except where mandatory consumer law requires otherwise. Any dispute that must be brought in court will be brought in a court with lawful jurisdiction in Texas unless applicable law gives you the right to bring it elsewhere.</p>
          </Section>

          <Section title="17. Changes to these Terms">
            <p>We may update these Terms as the Services, business, or law changes. For material changes, we will provide reasonable notice through the Services, by email, or by updating this page before the changes take effect when required by law. Continued use after the effective date of revised Terms means you accept them.</p>
          </Section>

          <Section title="18. General terms">
            <p>If any provision is unenforceable, the remaining provisions remain in effect. Failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a merger, acquisition, reorganization, asset transfer, or similar transaction.</p>
            <p>These Terms and the Privacy Policy are the agreement between you and Cryzo regarding the Services unless separate written terms apply to a specific feature or customer relationship.</p>
          </Section>

          <Section title="19. Contact">
            <p>Questions, legal notices, and support requests about these Terms may be sent to <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--cryzo-text)] underline underline-offset-4">{CONTACT_EMAIL}</a>.</p>
          </Section>
        </div>
      </article>

      <footer className="border-t border-[var(--cryzo-border)]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-[var(--cryzo-muted)] sm:px-8">
          <span>© 2026 Cryzo</span>
          <div className="flex gap-4">
            <Link href="/terms" className="text-[var(--cryzo-text)]">Terms</Link>
            <Link href="/privacy" className="hover:text-[var(--cryzo-text)]">Privacy</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
