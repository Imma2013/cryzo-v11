# Cryzo Expo SDK profile

Managed mobile projects use Expo SDK 58. Expo Go on physical iPhones supports the current SDK; updating the profile must include migration of saved projects, not only the starter.

The following files were obtained from Expo on 2026-10-25:

- `src/lib/workspace/expo-sdk58-modules.json`: `bundledNativeModules.json` from the published `expo@58.0.17` npm archive (Expo, MIT). SHA-256: `caaa93840f1d9649dd4e4fe64ff868847f10e9ddcff66e823fcac0af7ee6e1c6`.
- `src/lib/workspace/expo-sdk58-schema.json`: the `data` response from `https://exp.host/--/api/v2/project/configuration/schema/58.0.0`. It is supplied to the CLI through its supported `EXPO_UNIVERSE_DIR` local-schema path. SHA-256: `4f59d8d223889e330c6004fe1daf2c76880460661b0f0f0c5655cf47c3c7bac3`.

Update both files and the core dependency profile together. Keep user source and configuration; normalize only managed framework versions and obsolete `sdkVersion`. Do not automatically downgrade a newer project SDK. Generated schema files inside Vivari are cache files and are excluded from workspace persistence.

Vivari 1.1.1 reports Node 24.18.0 in its process shim, satisfying SDK 58's Node requirement. Metro preparation checks this again inside the running project. No alternate runtime or public tunnel is introduced.

The public preview relay constructs trusted forwarding headers. SDK 58 may emit relative manifest URLs; readiness resolves them against the public session origin and checks the project SDK before publishing a scan-ready URL.
