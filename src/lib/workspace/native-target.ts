import type { ArtifactAction, FileMap } from "./types";

/** A persisted native project must not switch to Vite because an LLM emitted a web manifest. */
export function hasNativeSource(files: FileMap): boolean {
  const manifest = files["package.json"]?.content || "";
  try {
    const pkg = JSON.parse(manifest);
    if (pkg?.dependencies?.expo && pkg?.dependencies?.["react-native"]) return true;
  } catch { /* partial manifest; inspect source instead */ }
  const app = files["App.tsx"]?.content || files["App.jsx"]?.content || "";
  return /(?:from\s*['"]react-native['"]|require\(['"]react-native['"]\)|from\s*['"]expo(?:-[^'"]+)?['"])/.test(app);
}

export function nativeTargetFromActions(actions: ArtifactAction[]): boolean {
  const files: FileMap = {};
  for (const action of actions) {
    if (action.type === "file" && action.filePath)
      files[action.filePath.replace(/^\.\//, "")] = { type: "file", content: action.content };
  }
  return hasNativeSource(files);
}

/** No browser kernel, npm install, Vite build or HMR recovery for Expo. */
export function shouldUseVivari(nativeTarget: boolean, files: FileMap): boolean {
  return !nativeTarget && !hasNativeSource(files);
}

export function shouldRetryFailedPreview(progress: string, sourceChanged: boolean): boolean {
  return progress !== "error" || sourceChanged;
}
