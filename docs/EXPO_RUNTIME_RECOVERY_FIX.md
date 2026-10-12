# Expo runtime isolation and failed-preview recovery

This release fixes mixed Expo/Vite generation, browser resumption, and device preview.
The conversation's persisted native target is authoritative. First mobile build requests
are classified before prompting the model and correct stale `web` metadata through
an authenticated Convex mutation; older explicitly mobile chats are migrated using
their original first user request. A real native App.tsx or Expo manifest is a
secondary recovery signal if saved generated package.json was overwritten by Vite.

Native generation and restoration now write to Cryzo's in-memory project file map,
not the browser Vivari filesystem. The native source is validated via the existing
file/project guard. The verified Expo starter supplies SDK configuration and scripts,
so generated Vite commands and web entrypoints are ignored. The authoritative
native target flows through chat preboot, workspace hooks, restoration, Safari tab
resume, manual retry, and the workspace preview display. Native operations never
run `npm run dev`, Vite production builds, or Vivari boot.

Ready Expo workspaces automatically open Device Preview once; cloud Metro validates
and compiles the native source before returning a real tunnel URL to the QR display.
Vite websites still use Vivari, but a failed build will not re-run just because a
user refocuses the tab: users can retry after changing source or explicitly.

## Verification scenarios
- First prompt "Build a mobile app for calorie tracking" chooses native on server.
- Native generation uses verified Expo files without browser kernel.
- Mixed native App.tsx and legacy Vite package.json restores as Expo, not Vite.
- Background Safari/tab recovery and explicit retry never start a Vite process for Expo.
- Existing saved-web first mobile prompts migrate to native without changing unrelated sites.
- QR appears only when Expo source is ready and cloud Metro supplies its real URL.
- Standard websites and web previews still use Vivari and retain build validations.
