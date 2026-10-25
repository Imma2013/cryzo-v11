import { EXPO_SUPPORTED_SDK } from "../workspace/expo-starter";

/** Validate the manifest itself; a running web server is not native compatibility. */
export function inspectExpoManifest(manifest: unknown, publicOrigin: string) {
  const value = manifest as { launchAsset?: {url?: unknown}; bundleUrl?: unknown;
    sdkVersion?: unknown; extra?: {expoClient?: {sdkVersion?: unknown}} } | null;
  const sdkVersion = value?.extra?.expoClient?.sdkVersion ?? value?.sdkVersion;
  if (typeof sdkVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(sdkVersion))
    return {phase: "connecting" as const, message: "Waiting for Metro's native SDK information…"};
  if (Number(sdkVersion.split(".")[0]) !== EXPO_SUPPORTED_SDK)
    return {phase: "error" as const, sdkVersion, supportedSdk: EXPO_SUPPORTED_SDK,
      message: `This project uses Expo SDK ${sdkVersion}. Reopen the project to upgrade to SDK ${EXPO_SUPPORTED_SDK}, then reconnect with the current Expo Go.`};
  const raw = value?.launchAsset?.url ?? value?.bundleUrl;
  try {
    if (typeof raw !== "string" || !raw.trim()) throw new Error();
    const bundle = new URL(raw, publicOrigin + "/");
    if (bundle.origin !== publicOrigin || bundle.username || bundle.password) throw new Error();
    return {phase: "ready" as const, bundleUrl: bundle.href, sdkVersion, supportedSdk: EXPO_SUPPORTED_SDK};
  } catch {
    return {phase: "error" as const, message: "Metro advertised a bundle outside this phone session. Reconnect Expo preview."};
  }
}
