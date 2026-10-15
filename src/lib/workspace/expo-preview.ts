export type ExpoLaunchTarget = "expo-go" | "development-build";
export type ExpoPreview = {
  deviceUrl: string; webPreviewUrl: string | null; launchTarget: ExpoLaunchTarget;
  sourceRevision: string; status: "ready"; output?: string;
};

export function selectExpoLaunchTarget(nativeDependencies: string[], bundledDependencies: string[]): ExpoLaunchTarget {
  const bundled = new Set([...bundledDependencies, "expo", "react-native", "expo-dev-client"]);
  return nativeDependencies.some(name => !bundled.has(name)) ? "development-build" : "expo-go";
}

export function deviceUrlFromLogs(logs: string, scheme: string, target: ExpoLaunchTarget): string | null {
  const clean = logs.replace(/\x1b\[[0-9;]*m/g, "");
  const urls = clean.match(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi) || [];
  return urls.find(value => target === "expo-go"
    ? /^exps?:\/\//i.test(value)
    : value.toLowerCase().startsWith(scheme.toLowerCase() + "://")) || null;
}
