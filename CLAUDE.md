@AGENTS.md

# Cryzo v11 — Project Rules

## Tech Stack
- Next.js 16 (App Router, `src/` dir)
- AI SDK v6 (`ai@6.x`) — uses `useChat` with `DefaultChatTransport`, `sendMessage`, `setMessages`, `streamText`, `toUIMessageStreamResponse`, `stepCountIs`
- OpenAI GPT-5.4 (do NOT substitute models)
- Composio (`@composio/core`, `@composio/vercel`) — type the client as `Composio<VercelProvider>`
- Firebase Auth (client-side only, currently bypassed for testing)
- Convex (DB + real-time queries)
- Tailwind CSS 4 (dark theme: zinc/black palette)
- WebContainer API for workspace preview
- `react-resizable-panels` v4 (uses `Group`, `Panel`, `Separator` — NOT `PanelGroup`/`PanelResizeHandle`)

## Conventions

### AI SDK v6 (NOT v4/v5)
- `useChat` returns `{ messages, setMessages, sendMessage, status, error }` — NO `input`, `handleSubmit`, `handleInputChange`
- Use `DefaultChatTransport` with `api` and `body` options
- Server: `streamText` + `toUIMessageStreamResponse()` (NOT `toDataStreamResponse`)
- Use `stepCountIs(n)` for `stopWhen` (NOT `maxSteps`)
- Tool parts use `isToolUIPart()` guard, access `.input` / `.output` / `.state`

### Convex
- Always use `"skip"` as second arg to `useQuery` when the args aren't ready (e.g., `userId ? { userId } : "skip"`)
- Mutations are fire-and-forget from hooks — don't await in render
- Schema uses `v.optional(v.any())` for flexible JSON fields
- Artifacts stored in `artifacts` table, linked to conversations

### Composio
- Lazy-init with `export const dynamic = "force-dynamic"` on the route
- Type as `Composio<VercelProvider>` to avoid generic mismatch
- Session IDs are per-conversation, stored in Convex `conversations.composioSessionId`

### WebContainer Workspace
- All workspace components are `"use client"` — WebContainer is browser-only
- COEP header MUST be `require-corp` (NOT `credentialless`) — bolt.diy uses this, it's what enables SharedArrayBuffer on ChromeOS
- COOP header: `same-origin`
- Headers apply to ALL routes (workspace is inline on chat page, not a separate route)
- AI outputs code in `<cryzoArtifact>` / `<cryzoAction>` XML tags
- Artifact parser strips XML from display text during streaming (shows progress card, NOT raw code)
- WebContainer singleton stays alive across conversation switches — do NOT teardown on navigation
- Inspector script injected via `setPreviewScript()` after boot
- New artifacts (edits) get written to the running container — Vite HMR refreshes preview

### Chat + Workspace Layout (like bolt.diy/Dyad)
- Chat on LEFT, workspace on RIGHT — same page, NOT separate routes
- Workspace auto-opens when first artifact is generated
- Uses `react-resizable-panels` for draggable split
- Workspace has: toolbar (Preview/Code toggle, inspector, device sizes, fullscreen) + main area + terminal

### AI Code Generation (System Prompt Rules)
- AI MUST output `<cryzoArtifact>` tags for ALL code — never show raw code in chat
- For edits: output NEW artifact with only changed files — never say "paste this" or "replace X with Y"
- Always include `npm install` shell action before `npm run dev` start action
- package.json MUST be first file action
- Use Tailwind CSS via `@tailwindcss/vite` plugin
- Use Unsplash for stock photos, Google Fonts for typography
- Generate production-ready, visually stunning websites (not plain HTML)
- AI knows about element picker — when it sees `[User selected element: ...]`, edit that specific element

### Styling
- Dark theme only (bg-black, bg-zinc-900/950, text-white/zinc)
- No light mode
- Use `cn()` from `@/lib/utils` for conditional classes

## Don't (Mistakes Made This Session)
- Never suggest alternative models — use exactly what's specified
- Never use `maxSteps` (it's `stopWhen: stepCountIs(n)` in v6)
- Never use `toDataStreamResponse` (it's `toUIMessageStreamResponse` in v6)
- Never use `initialMessages` with `useChat` — use `setMessages` after load
- Never use `Cross-Origin-Embedder-Policy: credentialless` — use `require-corp` (credentialless doesn't enable crossOriginIsolated on ChromeOS)
- Never put workspace on a separate route — it must be inline with chat (same page, resizable panels)
- Never show raw `<cryzoArtifact>` XML in chat — parser must handle streaming (incomplete tags) by showing a progress card
- Never teardown WebContainer on conversation switch — keep it alive, just write new files
- Never tell user to paste code manually — AI must output artifact with the edit
- Never use `PanelGroup`/`PanelResizeHandle` — react-resizable-panels v4 uses `Group`/`Panel`/`Separator`
- Never use `coep: "credentialless"` in WebContainer.boot() — not needed with require-corp headers

## Reference Projects
- `/home/lloydebnchenge/bolt.diy` — WebContainer patterns, inspector script, COEP headers, design instructions
- `/home/lloydebnchenge/dyad` — UI layout (chat+workspace split), element picker, response processing, proxy injection

## Deploy
- `vercel --prod` to deploy
- Convex deploys via `npx convex deploy --cmd 'npm run build'` (in vercel.json buildCommand)
- GitHub: https://github.com/Imma2013/cryzo-v11
- Live: https://cryzo-v11.vercel.app
