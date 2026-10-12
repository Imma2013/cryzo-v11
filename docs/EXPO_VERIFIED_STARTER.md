# Verified Expo starter and automatic framework routing

Cryzo no longer requires users to select Web/iOS/Android on the new chat screen.
A request for a mobile app, an app for calorie tracking, iOS, or Android is routed
into a stored native target automatically. Explicit website requests remain on Vite.
Older conversations keep their persisted target.

## Native starter

Cryzo initializes a pinned Expo SDK 57 / React Native 0.86.3 project with a
valid Expo entry point, `App.tsx`, `app.json`, and a TypeScript config that
extends `expo/tsconfig.base` and includes root files. The model writes native
screens and components and cannot overwrite the runtime-owned app config or
insert a Vite browser bridge. Requested additional packages merge into the
starter manifest while the SDK-compatible core versions stay pinned.

The Vivari filesystem is used for editing and streaming source, but never for
Vite-building Expo apps. Expo Metro runs in the persistent Cryzo cloud sandbox
only when the user opens Device Preview. This behavior applies to both desktop
and mobile Cryzo workspaces, including after a conversation reload.

A real Expo QR is rendered in Cryzo using the local `qrcode` dependency. The
preview requires complete native source, runs a real TypeScript check, installs
packages, and only then starts the tunnel. Invalid or unfinished app projects
show actionable errors instead of fake ready states. The Expo tunnel continues
to support reconnects without restarting a healthy process.

Explicit SwiftUI/Kotlin requests are recognized but not silently redirected to
Expo; those native compilers and device tooling require a separate supported
build environment and are not enabled in this release.

## Acceptance

- New mobile calorie-tracking request yields Expo files and no Vite config.
- SDK 57 React Native versions remain compatible, app root TS is included.
- Website request remains on React/Vite.
- Native TypeScript errors are visible before displaying the Expo QR.
- Mobile + desktop workspace show the same native Device Preview behavior.
- Reload of an Expo conversation reconstructs the starter before user files.
- All existing web, Convex, publishing and project history flows remain intact.
