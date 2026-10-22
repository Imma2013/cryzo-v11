# Vivari workbench and phone preview release

## Runtime ownership

Vivari 1.1.1 owns the project filesystem, interactive shell, package installation and Metro on port 8081. Switching views detaches terminal renderers and retains shell sessions and editor drafts. Source saves wait for generation and compare the current filesystem before writing. Cryzo design recipes and generated-app prompts are unchanged.

Browser preview is served by Vivari's Service Worker. Device Preview and Publish use one phone session and the same validated URL. QR codes are rendered in the terminal and in a toolbar popover after the public Expo manifest advertises this session's bundle host. A valid manifest does not establish that its native bundle has finished compiling.

A pinned, content-hashed SDK worker extension configures the existing Vivari network relay. Only inbound port 8081 is allowed. Outbound connections are denied. Vercel HTTP/WebSocket handlers forward bounded frames through temporary Convex session/stream/frame tables; producer epochs fence stale sockets, streams apply backpressure, and a cron removes expired data. No Cloudflare or ngrok is used.

This is a development preview. The producing browser must stay open; mobile browsers may suspend workers in the background. Resuming renews the producer ticket and checks readiness without presenting a stale QR as ready.

## Configuration

Keep existing CRYZO_INTERNAL_API_SECRET and CRYZO_SECRETS_KEY values. Do not rotate them for this release.

- Future phone-preview setup requires CRYZO_EXPO_PREVIEW_DOMAIN=preview.cryzo.me and the wildcard bound to the app environment. The current configuration remains scoped to the PR preview branch; production phone-preview activation is deferred at the user's request.
- Attach *.preview.cryzo.me to the same Vercel deployment as the app. DNS is saved at Squarespace: CNAME *.preview -> 067d61491bddd6ca.vercel-dns-017.com, plus NS _acme-challenge.preview -> ns1.vercel-dns.com and ns2.vercel-dns.com for certificate validation. Existing authoritative nameservers are retained. Vercel accepts the wildcard configuration; certificate readiness has not been established.
- Convex must contain expoRelay, chatgptConnections and crons plus the additive tables/indexes from this branch. Audit the production schema diff before deployment; do not remove unrelated production indexes.
- Fluid Compute and the configured 300 second function duration are required. Producer connections rotate before that limit; each session expires after one hour.

## Hosted ChatGPT plan connection

The connection stays disabled until OpenAI grants a hosted client and plan-sharing permission. Identity-only OAuth is insufficient. Do not reuse the open-source dynamic-registration route in this hosted app.

Required environment: CRYZO_CHATGPT_HOSTED_APPROVED=true, OPENAI_CHATGPT_CLIENT_ID, OPENAI_CHATGPT_USAGE_SCOPE, OPENAI_CHATGPT_REDIRECT_URI (exact HTTPS /api/chatgpt/callback), OPENAI_CHATGPT_AUTH_METHOD (client_secret_basic or none), and OPENAI_CHATGPT_CLIENT_SECRET when confidential. Store the secret encrypted. OAuth credentials remain encrypted in Convex, PKCE/state/nonce bind a single-use browser transaction, and refresh uses a versioned lease. The picker uses the connected account's model catalog. Plan inference never silently falls back to paid API usage.

Official hosted eligibility: https://developers.openai.com/siwc/website

## Verification and release

The existing Vercel build script runs the complete unit suite and Next compilation. The additional Actions workflow introduced in this PR duplicates that gate and could not run because the GitHub account is billing-locked; it has been removed. Existing repository checks are unchanged.

Release status (2026-10-22 UTC):

- The code commit 92af1f5 passed all 176 tests across 43 suites, Next compilation and TypeScript on Vercel.
- Production Convex deployment to precise-oyster-745 completed successfully. The deployment added 13 indexes and deleted none.
- The user explicitly excluded Expo phone-preview testing from this release. Native bundle delivery, physical QR scanning and phone HMR remain unverified and are not claimed as passing. The following phone checks are deferred follow-up checks, not release blockers.
- Hosted ChatGPT remains disabled pending OpenAI approval and the registered hosted client configuration.

Verification checklist:

1. Require a successful Vercel build for the exact head commit.
2. Validate wildcard DNS/TLS from outside the producing browser.
3. In a real browser with adequate memory, generate the pinned Expo starter using Vivari. Check npm exit, Metro port, browser bundle, public manifest, full iOS/Android bundle response and HMR.
4. Decode the terminal QR and toolbar QR and verify the same URL. Open the iOS link in Expo Go and confirm an edit refreshes the phone. Check reconnect after suspension, expired sessions and unsupported native dependencies.
5. Check editor conflict handling against concurrent generation/shell writes, panel remounts, terminal persistence, and source checkpoint persistence. Source deletions and a complete file CRUD interface are not part of this change; file creation/editing through the terminal remains available.
6. Complete hosted OAuth and plan inference tests only with an approved client; until then leave the gate off.
7. The additive Convex schema is deployed. Release the verified workbench and gated ChatGPT changes with Expo phone acceptance explicitly deferred by the user. Retain the phone-preview configuration steps for future validation.

The automated remote smoke authenticated to Vercel and confirmed cross-origin isolation, but its Vivari page crashed in the small remote test sandbox before Metro started. Physical phone/bundle delivery has not been verified, and further phone testing was excluded by the user. Development and production Convex typecheck/deployment passed. Workbench source deletions and a complete file CRUD interface remain outside this change.
