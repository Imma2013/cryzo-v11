# Vivari workbench and phone preview release

## Runtime ownership

Vivari 1.1.1 owns the project filesystem, interactive shell, package installation and Metro on port 8081. Switching views detaches terminal renderers and retains shell sessions and editor drafts. Source saves wait for generation and compare the current filesystem before writing. Cryzo design recipes and generated-app prompts are unchanged.

Browser preview is served by Vivari's Service Worker. Device Preview and Publish use one phone session and the same validated URL. QR codes are rendered in the terminal and in a toolbar popover after the public Expo manifest advertises this session's bundle host. A valid manifest does not establish that its native bundle has finished compiling.

A pinned, content-hashed SDK worker extension configures the existing Vivari network relay. Only inbound port 8081 is allowed. Outbound connections are denied. Vercel HTTP/WebSocket handlers forward bounded frames through temporary Convex session/stream/frame tables; producer epochs fence stale sockets, streams apply backpressure, and a cron removes expired data. No Cloudflare or ngrok is used.

This is a development preview. The producing browser must stay open; mobile browsers may suspend workers in the background. Resuming renews the producer ticket and checks readiness without presenting a stale QR as ready.

## Configuration

Keep existing CRYZO_INTERNAL_API_SECRET and CRYZO_SECRETS_KEY values. Do not rotate them for this release.

- CRYZO_EXPO_PREVIEW_DOMAIN=preview.cryzo.me on the release environment.
- Attach *.preview.cryzo.me to the same Vercel deployment as the app. DNS currently requires CNAME *.preview -> 067d61491bddd6ca.vercel-dns-017.com. Keep the existing authoritative nameservers.
- Convex must contain expoRelay, chatgptConnections and crons plus the additive tables/indexes from this branch. Audit the production schema diff before deployment; do not remove unrelated production indexes.
- Fluid Compute and the configured 300 second function duration are required. Producer connections rotate before that limit; each session expires after one hour.

## Hosted ChatGPT plan connection

The connection stays disabled until OpenAI grants a hosted client and plan-sharing permission. Identity-only OAuth is insufficient. Do not reuse the open-source dynamic-registration route in this hosted app.

Required environment: CRYZO_CHATGPT_HOSTED_APPROVED=true, OPENAI_CHATGPT_CLIENT_ID, OPENAI_CHATGPT_USAGE_SCOPE, OPENAI_CHATGPT_REDIRECT_URI (exact HTTPS /api/chatgpt/callback), OPENAI_CHATGPT_AUTH_METHOD (client_secret_basic or none), and OPENAI_CHATGPT_CLIENT_SECRET when confidential. Store the secret encrypted. OAuth credentials remain encrypted in Convex, PKCE/state/nonce bind a single-use browser transaction, and refresh uses a versioned lease. The picker uses the connected account's model catalog. Plan inference never silently falls back to paid API usage.

Official hosted eligibility: https://developers.openai.com/siwc/website

## Verification and release

The existing Vercel build script runs the complete unit suite and Next compilation. The additional Actions workflow introduced in this PR duplicates that gate and could not run because the GitHub account is billing-locked; it has been removed. Existing repository checks are unchanged.

Before production release:

1. Require a successful Vercel build for the exact head commit.
2. Validate wildcard DNS/TLS from outside the producing browser.
3. In a real browser with adequate memory, generate the pinned Expo starter using Vivari. Check npm exit, Metro port, browser bundle, public manifest, full iOS/Android bundle response and HMR.
4. Decode the terminal QR and toolbar QR and verify the same URL. Open the iOS link in Expo Go and confirm an edit refreshes the phone. Check reconnect after suspension, expired sessions and unsupported native dependencies.
5. Check editor conflict handling against concurrent generation/shell writes, panel remounts, terminal persistence, and source checkpoint persistence. Source deletions and a complete file CRUD interface are not part of this change; file creation/editing through the terminal remains available.
6. Complete hosted OAuth and plan inference tests only with an approved client; until then leave the gate off.
7. Audit/deploy the additive Convex schema, move wildcard binding to production, set the production preview domain, and merge only after the phone smoke passes.

The automated remote smoke authenticated to Vercel and confirmed cross-origin isolation, but its Vivari page crashed in the small remote test sandbox before Metro started. Physical phone/bundle delivery has not been verified. Development Convex codegen/typecheck/deployment passed; production Convex is unchanged.
