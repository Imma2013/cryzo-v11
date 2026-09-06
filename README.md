# Cryzo

Cryzo is an open-source AI app builder that combines conversational web/mobile generation, a managed backend, connected apps, publishing, and social marketing in one workspace.

The hosted product lives at **cryzo.me**. This repository is the community/self-hostable edition and is licensed under Apache-2.0.

## What Cryzo includes

- **AI builder** — build and edit apps by chatting with managed models, BYOK providers, or supported local OpenAI-compatible models.
- **Web apps** — React + Vite projects run inside persistent Vercel Sandbox workspaces during hosted development.
- **Native mobile apps** — one Expo + React Native codebase can target iOS and Android. New mobile projects are native source, not a WebView wrapper.
- **Cryzo Cloud** — Convex-powered database, app authentication/users, ownership rules, and the managed application API.
- **Connections** — optional Composio-powered external tools and OAuth connections.
- **Marketing** — connected-account drafting, media upload, publishing/scheduling, and calendar delivery for Facebook, Instagram, LinkedIn, and YouTube.
- **Publishing** — Cryzo hosting, your own Vercel, GitHub sync, Expo/EAS builds, App Store/Google Play readiness checks, and store submission workflows.

## Architecture

```text
Browser / Cryzo UI
  ├─ AI builder ───────────────┐
  ├─ Marketing agent          │
  └─ Dashboard                │
                              ▼
Next.js application on Vercel
  ├─ AI SDK + provider adapters
  ├─ Composio (optional external actions)
  ├─ Vercel Sandbox (generated project runtime)
  ├─ Expo / EAS (native mobile delivery)
  └─ Cryzo Cloud API
          │
          ▼
       Convex
  ├─ Cryzo user auth
  ├─ conversations + artifacts
  ├─ cloud app namespaces
  ├─ logical entity schemas + records
  ├─ app users + sessions
  ├─ billing/usage
  └─ social scheduling state
```

### Cryzo Cloud

Generated apps do **not** need a fictional `@cryzo/cloud` npm package. Cryzo Cloud is platform-owned infrastructure. Generated apps use a small local typed client that calls the managed `/api/cloud/v1` API with the public app ID.

In the hosted product, Cryzo Cloud is multi-tenant on Convex: each generated app receives its own app namespace, auth users/sessions, logical entity schemas, and records while authorization remains enforced server-side.

Self-hosters can keep this architecture or replace the cloud adapter with their own backend.

## Local development

### Requirements

- Node.js 20+
- npm
- A Convex project/deployment

### Install

```bash
git clone https://github.com/Imma2013/cryzo-v11.git
cd cryzo-v11
npm install
```

Create your local environment from the values required by your deployment. At minimum, configure the Convex URLs/auth values used by the project. Optional features need their own provider credentials.

Run Convex in one terminal and Next.js in another:

```bash
npx convex dev
```

```bash
npm run dev
```

Then open `http://localhost:3000`.

## Optional services

Cryzo is designed so self-hosting does not require buying Cryzo-hosted AI credits.

- **AI providers:** connect supported provider keys or local compatible endpoints.
- **Vercel Sandbox:** required for the same remote generated-project runtime used by cryzo.me. A self-host fork may swap this runtime.
- **Composio:** optional for connected apps and social actions.
- **Stripe:** optional for running your own hosted billing implementation.
- **Expo/EAS:** optional for managed iOS/Android cloud builds and store submission.
- **Supabase / BYO Convex:** generated projects may use these only when explicitly requested instead of Cryzo Cloud.

Never commit production API keys, OAuth secrets, store credentials, or Stripe secrets to a fork.

## Web and mobile targets

### Web

Cryzo's default web target is React + TypeScript + Vite. Hosted previews execute in Vercel Sandbox.

### iOS + Android

Cryzo generates one shared Expo + React Native project for both platforms. `app.json` contains iOS and Android configuration, while EAS builds the selected target. A lightweight React Native Web bridge is used only for browser preview; the native source remains the source of truth.

## Marketing

The hosted Marketing workspace currently exposes:

- Facebook
- Instagram
- LinkedIn
- YouTube

X/Twitter, Reddit, and TikTok plumbing remains in the codebase but is intentionally hidden from the active Marketing product for now.

Marketing chat can draft content or execute an explicitly requested action through a connected account. Images and videos can be attached directly to the Marketing chat or manual post composer.

## App Store / Google Play workflow

Cryzo's mobile publishing flow is:

1. **Scan Store Readiness** — source checks for native APIs, safe areas, navigation, privacy, account deletion, permissions, assets, secrets, billing conflicts, and related store concerns.
2. **Fix with AI** — send the actionable findings back to the builder.
3. **Build Store Files** — hosted Cryzo can run EAS on supported paid plans; self-hosters can run EAS directly.
4. **Submit Your App** — submit through App Store Connect or Google Play with your own store credentials.

Native source and readiness scanning remain available without using Cryzo-managed build compute.

## Pricing and the hosted service

The source code is open. The hosted Cryzo business can charge for managed convenience and infrastructure: managed AI usage, Cryzo Cloud capacity, integrations, custom domains, managed EAS compute, one-click store submission, social delivery volume, and team/enterprise capabilities.

BYOK, source export, and self-hosting are not intended to be artificially locked behind the hosted service.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

For security issues, see [SECURITY.md](SECURITY.md).

## License

Cryzo is licensed under the [Apache License 2.0](LICENSE).

The Apache license grants rights to use, modify, and redistribute the code; it does not grant rights to the Cryzo name, logo, or other brand identifiers. See [TRADEMARKS.md](TRADEMARKS.md).
