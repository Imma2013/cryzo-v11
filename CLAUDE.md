@AGENTS.md

# Cryzo v11 — Project Rules

## Tech Stack
- Next.js 16 (App Router, `src/` dir)
- AI SDK v6 (`ai@6.x`) — uses `useChat` with `DefaultChatTransport`, `sendMessage`, `setMessages`, `streamText`, `toUIMessageStreamResponse`, `stepCountIs`
- OpenAI GPT-5.4 (do NOT substitute models)
- Composio (`@composio/core`, `@composio/vercel`) — type the client as `Composio<VercelProvider>`
- Firebase Auth (client-side only)
- Convex (DB + real-time queries)
- Tailwind CSS 4 (dark theme: zinc/black palette)
- WebContainer API for workspace preview

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

### Composio
- Lazy-init with `export const dynamic = "force-dynamic"` on the route
- Type as `Composio<VercelProvider>` to avoid generic mismatch
- Session IDs are per-conversation, stored in Convex `conversations.composioSessionId`

### WebContainer Workspace
- All workspace components are `"use client"` — WebContainer is browser-only
- COEP/COOP headers are scoped to `/workspace/*` only (don't break Firebase Auth popups)
- AI outputs code in `<cryzoArtifact>` / `<cryzoAction>` XML tags
- Artifact parser strips XML from display text, saves structured actions to Convex

### Styling
- Dark theme only (bg-black, bg-zinc-900/950, text-white/zinc)
- No light mode
- Use `cn()` from `@/lib/utils` for conditional classes

### Don't
- Never suggest alternative models — use exactly what's specified
- Never use `maxSteps` (it's `stopWhen: stepCountIs(n)` in v6)
- Never use `toDataStreamResponse` (it's `toUIMessageStreamResponse` in v6)
- Never use `initialMessages` with `useChat` — use `setMessages` after load
