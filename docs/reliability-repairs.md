# MCP, generation, Cloud, and Expo reliability

## Behavior

- MCP tool JSON schemas cross Convex RPCs as strings. Discovery stages an independent catalog, then atomically activates it; a failed verification leaves the previous catalog and OAuth credential intact.
- Builds start a Vercel Workflow and persist progress, completed files, stable message IDs, and tool results in Convex. Browser transport can disconnect and be replaced without restarting the build. Stop cancels the task and the workflow.
- Device/account provider credentials copied into a build context are encrypted with the existing CRYZO_SECRETS_KEY. Contexts are removed on terminal status and expire after one hour. Workflow arguments contain task IDs only. A crashed paid generation step is not blindly retried; saved files remain available for an explicit retry.
- Cloud has Back to Preview; the main Preview button selects the app. The preview iframe stays mounted while Cloud is open.
- Expo startup is a separate persisted task. It uses a supported 30-minute Sandbox session, detached Metro/proxy commands, warm dependency downloads, and native readiness independent of web bundle compilation. A healthy runtime is reused on source edits. QR access opens once in the toolbar and stays available during health refreshes.

## Deployment

Vercel Workflow is configured through withWorkflow in Next.js. Fluid compute is already enabled on the Cryzo Vercel project. Existing CRYZO_INTERNAL_API_SECRET and CRYZO_SECRETS_KEY are reused; do not rotate them for this release. Convex changes add optional fields, indexes, and tables without deleting existing data.

The review branch is scoped to the development Convex deployment (acoustic-yak-317). Production deployment remains the existing main-branch CI process. Generated src/app/.well-known/workflow routes and Vivari assets are build outputs, not committed source.

## Verification

Regression coverage includes actual Convex serialization with nested $schema/$defs/$ref, staged discovery failures, ownership isolation, duplicate task claims, stale checkpoints, stable message adoption, stale browser saves, cancellation/expiry cleanup, incomplete AI streams, actual AI SDK finish events, tool-result JSON, service-worker API routing, detached Expo startup, and warm reuse despite unavailable web preview.

Production build and development Convex deployment are required gates. ESLint is not clean across the existing builder and remaining integration any annotations; tests and TypeScript are the active CI gates.

Before production release, verify Firecrawl OAuth and a tool call in an authenticated browser; background Safari/Brave during a real build; check Cloud-to-preview navigation; and scan a live Expo QR with a physical iPhone. Unit fixtures do not establish these physical-device results.
