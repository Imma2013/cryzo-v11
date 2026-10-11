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
- Vivari (`@vivari/core`) in-browser runtime for workspace preview
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

### In-browser runtime (Vivari)
- The preview runtime is Vivari (`@vivari/core`, MIT). All of it goes through `src/lib/workspace/sandbox.ts` — do not import `@vivari/core` anywhere else
- All workspace components are `"use client"` — the runtime is browser-only
- The SDK is NOT bundled by Next.js. `scripts/sync-vivari-assets.mjs` (runs before `dev` and `build`) copies it to `public/` and `sandbox.ts` loads `/vivari/index.js` with a native `import()`. Generated files under `public/assets`, `public/vivari`, `public/vendor`, `public/vv-devtools` and `public/sw.js` are git-ignored
- COEP header MUST be `require-corp` (NOT `credentialless`) and COOP `same-origin` on `/chat` and on the runtime's static files (see `next.config.ts`)
- `/sw.js` is the preview Service Worker; it serves `/preview/<port>/…` from the dev server running in the tab
- Project files live in `/cryzo-project` inside the runtime; `sandbox.fs` paths are relative to it
- Run command lines with `sandbox.spawnShell()` (`sh -c`). The shell has no `jsh`, and native binaries (git, curl, ffmpeg) do not exist
- AI outputs code in `<cryzoArtifact>` / `<cryzoAction>` XML tags
- Artifact parser strips XML from display text during streaming (shows progress card, NOT raw code)
- The runtime singleton stays alive across conversation switches — do NOT tear it down on navigation; the project directory is cleared instead
- `public/inspector-script.js` (element picker + preview error reporter) is injected into every preview page through Vivari's `/vv-devtools/chobitsu.js` slot
- Every preview iframe must be attached with `attachSandboxPreview()` or Vite HMR never connects
- New artifacts (edits) get written to the running runtime → Vite HMR refreshes preview
- Node + npm is the default; Bun and Python only when the user asks (rules in `src/lib/ai/runtime-rules.ts`)

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
- Never tear down the runtime on conversation switch — keep it alive, just write new files
- Never tell user to paste code manually — AI must output artifact with the edit
- Never use `PanelGroup`/`PanelResizeHandle` — react-resizable-panels v4 uses `Group`/`Panel`/`Separator`

## Reference Projects
- `/home/lloydebnchenge/bolt.diy` — inspector script, COEP headers, design instructions
- `/home/lloydebnchenge/dyad` — UI layout (chat+workspace split), element picker, response processing, proxy injection

## Deploy
- `vercel --prod` to deploy
- Convex deploys via `npx convex deploy --cmd 'npm run build'` (in vercel.json buildCommand)
- GitHub: https://github.com/Imma2013/cryzo-v11
- Live: https://cryzo-v11.vercel.app
