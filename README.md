# Cryzo

Cryzo is an open-source AI app builder for creating, editing, previewing, and shipping web and native applications from the browser.

The hosted product lives at **cryzo.me**. This repository is the community/self-hostable edition and is licensed under Apache-2.0.

## What Cryzo includes

- **AI builder** — build and edit projects by chatting with Cryzo-managed models, BYOK providers, or supported local OpenAI-compatible endpoints.
- **Browser-native web development** — React + TypeScript + Vite projects run inside WebContainers, so hosted development does not require installing Node.js locally or waiting for a remote preview VM.
- **Native mobile apps** — one Expo + React Native codebase targets iOS and Android. Native source remains the source of truth.
- **Cryzo Cloud** — Convex-powered database, generated-app auth/users, ownership rules, and the managed application API.
- **Developer connections** — GitHub, Vercel, Supabase, Stripe, Composio-powered apps, and remote MCP servers.
- **MCP connectors** — connect compatible HTTPS Model Context Protocol servers and expose their tools to supported Cryzo models without placing connector credentials in generated code.
- **Publishing** — Cryzo hosting, your own Vercel, GitHub sync, Expo/EAS builds, App Store/Google Play readiness checks, and store submission workflows.

## Architecture

```text
Browser / Cryzo UI
  ├─ AI builder
  ├─ WebContainer project runtime + live preview
  ├─ Code/files/editor
  └─ Project dashboard
          │
          ▼
Next.js application on Vercel
  ├─ AI SDK + model provider adapters
  ├─ MCP client + encrypted connector credentials
  ├─ Composio (optional external actions)
  ├─ Cryzo Cloud API
  └─ Mobile delivery services
          │
          ├──────────────► Expo / EAS
          │
          └──────────────► Vercel Sandbox for managed mobile build workflows
          │
          ▼
        Convex
  ├─ Cryzo Google auth
  ├─ conversations + artifacts
  ├─ generated-app cloud namespaces
  ├─ logical entity schemas + records
  ├─ app users + sessions
  ├─ MCP configuration metadata
  └─ billing/usage
```

Generated source and artifacts are durable in Convex. The browser WebContainer is disposable runtime state: a project can be reconstructed from its saved artifacts when a conversation is reopened.

### Cryzo Cloud

Generated apps do **not** need a fictional `@cryzo/cloud` package. Cryzo Cloud is platform-owned infrastructure. Generated apps use a small local client that calls the managed `/api/cloud/v1` API with the public app ID.

In the hosted product, each generated application receives its own logical namespace, app users/sessions, entity schemas, and records while authorization remains enforced server-side.

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

Configure the Convex URLs/auth values required by your deployment. Optional providers and hosted integrations need their own environment variables.

Run Convex in one terminal and Next.js in another:

```bash
npx convex dev
```

```bash
npm run dev
```

Then open `http://localhost:3000`.

## WebContainer previews

Cryzo's hosted web builder runs generated projects inside a browser WebContainer. Project files are written into the container, dependencies are installed there, and the project's dev server is embedded into the Cryzo preview workspace.

Cryzo uses cross-origin isolation headers on the builder routes required by WebContainers. Preview health reporting distinguishes a server that merely opened a port from an application that actually rendered successfully.

The browser runtime is never the durable source of truth. Saved project artifacts remain in Convex.

## AI models and BYOK

Cryzo can provide managed models through OpenRouter and can also use user-supplied provider credentials. BYOK credentials are kept outside generated project source.

The hosted managed default is **Nemotron 3.5 Lightning Free**. Supported BYOK providers include OpenRouter, Google Gemini, OpenAI, Anthropic, xAI, Groq, DeepSeek, Mistral, Together, Cerebras, NVIDIA, and compatible custom endpoints.

## MCP connectors

Cryzo can connect compatible remote MCP servers over HTTPS.

Current connector flow:

1. Add a server name and HTTPS endpoint under **Apps → Connectors (MCP)**.
2. Use no authentication or save an API/bearer credential encrypted with `CRYZO_SECRETS_KEY`.
3. Test the server; Cryzo performs an MCP initialize handshake and discovers tools.
4. Enable or disable configured servers from the connector page or directly from the chat composer `+` menu.
5. Supported tool-calling models can invoke those MCP tools during a build or external action.

MCP credentials are server-side secrets and are not written to project files or exposed to the WebContainer.

## Optional services

Cryzo is designed so self-hosting does not require purchasing Cryzo-hosted AI credits.

- **AI providers:** managed OpenRouter models, BYOK providers, or supported local compatible endpoints.
- **Composio:** optional connected applications and OAuth actions.
- **MCP:** optional remote tool servers.
- **Stripe:** optional hosted billing.
- **Expo/EAS:** optional iOS/Android development builds, store builds, and submission.
- **Supabase:** an optional project database/backend connection when explicitly chosen instead of Cryzo Cloud.
- **GitHub / Vercel:** source-control and deployment connections.

Never commit production API keys, OAuth secrets, store credentials, MCP credentials, Expo tokens, or Stripe secrets to a fork.

## Web and mobile targets

### Web

Cryzo's default web target is React + TypeScript + Vite. Development previews execute in a WebContainer directly in the browser.

### iOS + Android

Cryzo generates one shared Expo + React Native project for both platforms. `app.json` contains iOS and Android configuration, while EAS builds the selected target. A lightweight React Native Web bridge may be used for browser preview; the native source remains the source of truth.

For compatible Expo projects, Cryzo also provides a QR-based physical-device preview flow.

## App Store / Google Play workflow

Cryzo's mobile publishing flow is:

1. **Scan Store Readiness** — analyze the current source for native APIs, safe areas, navigation, privacy, account deletion, permissions, assets, secrets, billing conflicts, accessibility, and native UX concerns.
2. **Fix with AI** — place the actionable findings back into the builder chat.
3. **Build Store Files** — hosted Cryzo can run supported Expo/EAS workflows; self-hosters can run EAS directly.
4. **Submit Your App** — submit through App Store Connect or Google Play with your own store credentials.

Native source and readiness scanning remain available without using Cryzo-managed build compute.

## Pricing and the hosted service

The source code is open. The hosted Cryzo service can charge for managed AI usage and infrastructure, Cryzo Cloud capacity, integrations, custom domains, and managed mobile build/submission workflows.

BYOK, source export, and self-hosting are not intended to be artificially locked behind the hosted service.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

For security issues, see [SECURITY.md](SECURITY.md).

## License

Cryzo is licensed under the [Apache License 2.0](LICENSE).

The Apache license grants rights to use, modify, and redistribute the code; it does not grant rights to the Cryzo name, logo, or other brand identifiers. See [TRADEMARKS.md](TRADEMARKS.md).
