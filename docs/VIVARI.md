# The in-browser runtime (Vivari)

Cryzo runs generated projects inside the user's browser tab on
[Vivari](https://vivari.run) (`@vivari/core`, MIT). It replaced StackBlitz
WebContainers. There is no server behind a preview: the filesystem, Node.js,
npm, the dev server and the terminal all live in Web Workers in the tab.

## How it is wired

| Piece | Where |
| --- | --- |
| The only module that talks to Vivari | `src/lib/workspace/sandbox.ts` |
| Project lifecycle (write files, install, start, build) | `src/lib/workspace/streaming-runtime.ts` |
| Terminal | `src/components/workspace/WorkspaceTerminal.tsx` |
| Preview iframe | `src/components/workspace/LivePreview.tsx` |
| Static runtime files | `scripts/sync-vivari-assets.mjs` → `public/` |
| Isolation headers | `next.config.ts` |
| What the AI is told about the runtime | `src/lib/ai/runtime-rules.ts` |

`scripts/sync-vivari-assets.mjs` runs before `npm run dev` and `npm run build`
and writes these git-ignored files:

| Path | What it is |
| --- | --- |
| `public/vivari/index.js` | the SDK, loaded with a native `import()` (never bundled by Next.js) |
| `public/assets/*.js` | the kernel and its nested Web Workers |
| `public/sw.js` | the preview Service Worker (scope `/`) |
| `public/vv-devtools/chobitsu.js` | a copy of `public/inspector-script.js`, injected into every preview page |
| `public/vendor/npm-pack.bin` | the real npm CLI, unpacked inside the runtime on first use |
| `public/vendor/pyodide/*` | CPython for `python` and `pip` |

The npm and Pyodide versions are pinned at the top of the script to the ones
`@vivari/core` is built against. Bump all three together.

## Requirements

- `/chat` and every runtime file must be served with
  `Cross-Origin-Embedder-Policy: require-corp` and
  `Cross-Origin-Opener-Policy: same-origin`. `next.config.ts` does this.
- `/sw.js` must be served with `Service-Worker-Allowed: /`.
- Anything the builder page embeds from another origin must send CORS or
  `Cross-Origin-Resource-Policy` headers, or the browser blocks it.

## What runs

- **Node.js + npm** — the default. Vite, React, Tailwind and the Expo web
  bridge Cryzo generates all run here.
- **Bun** — `bun install`, `bun run`, `Bun.serve`. An API-compatible layer on
  the Node runtime, not the native binary.
- **Python** — CPython via Pyodide, with `pip`. Cryzo hosts the interpreter and
  standard library; package wheels download from Pyodide's CDN on first use.
  Web servers start with `uvicorn`, `flask run` or `gunicorn`.

Native binaries (git, curl, ffmpeg, native Node addons) do not exist in the
runtime.

## Known limits

- **Previews share Cryzo's origin.** A preview is served from
  `/preview/<port>/` on the same origin as the builder, so code running in a
  preview can read the signed-in user's Cryzo session storage. Vivari supports
  serving previews from a separate origin (`previewOrigin`); enabling it needs a
  second hostname that serves Vivari's bridge documents.
- **The Service Worker has scope `/`.** Once the builder has booted, the same
  worker also sees requests from other Cryzo pages and passes them through.
- **The terminal is line-based.** Vivari's public API has no PTY, so full-screen
  terminal programs and cursor-key history are not available. Ctrl+C restarts
  the shell.
- **A preview URL only works in the tab that runs it.** It cannot be opened on
  another device.

## Browser preview isolation (Vivari mode B)

Vivari's default preview shares the builder's origin and is NOT isolated from
Cryzo's authenticated session. The runtime now supports the build-time variable
`NEXT_PUBLIC_VIVARI_PREVIEW_ORIGIN`, but do **not** enable it until a dedicated
static preview domain is provisioned. The preview domain must serve Vivari's
`sw.js`, `__vv-bridge.html`, `__vv-preview-boot.html`, and optional DevTools assets
with the documented COEP/CORP headers and root-scope Service Worker. It must
not serve Cryzo's authenticated application or forward authenticated cookies.
Using a second hostname for the same full Cryzo Vercel app is **not** sufficient.

After provisioning the dedicated bridge-only host, set the variable to its
exact HTTPS origin (no trailing slash) for the Vercel production build, deploy,
and verify iframe previews plus network/storage isolation. Without that variable,
Cryzo intentionally retains Vivari mode A and its documented security risk;
this is a deployment prerequisite, not a security fix that can be claimed by
shipping a configuration option alone.

## Generated-project recovery

For incomplete React/Vite artifacts, `project-scaffold.ts` restores only missing
starter files and preserves all Gemini-authored content. Restoration shares the
same execution queue as streamed actions. The `project` validator receives the
actual in-memory files, checks syntax and manifest readiness, and runtime checks
that `package.json` exists in Vivari before invoking npm.
Python and Expo projects are never silently converted to React/Vite.
