import { describe, expect, it } from "vitest";
import { hasNativeSource, nativeTargetFromActions, shouldRetryFailedPreview, shouldUseVivari } from "@/lib/workspace/native-target";
import type { FileMap, ArtifactAction } from "@/lib/workspace/types";

const native = (overrides: FileMap = {}): FileMap => ({
  "App.tsx": { type: "file", content: `import { View, Text } from 'react-native';\nexport default function App() { return <View><Text>Hello</Text></View> }` },
  ...overrides,
});

describe("authoritative native framework", () => {
  it("detects native source even if an AI generated a Vite manifest", () => {
    const files = native({ "package.json": { type: "file", content: JSON.stringify({ scripts: { build: "tsc && vite build" } }) } });
    expect(hasNativeSource(files)).toBe(true);
    expect(shouldUseVivari(false, files)).toBe(false);
  });
  it("treats a persisted Expo package as native even without a complete App.tsx", () => {
    expect(hasNativeSource({ "package.json": { type: "file", content: JSON.stringify({ dependencies: { expo: "57", "react-native": "0.86" } }) } })).toBe(true);
  });
  it("honors persisted native target even if generated files are all web", () => {
    const files: FileMap = { "vite.config.ts": { type: "file", content: "export default {}" } };
    expect(shouldUseVivari(true, files)).toBe(false);
  });
  it("recovers native identity from saved mixed artifacts", () => {
    const actions: ArtifactAction[] = [
      { type: "file", filePath: "package.json", content: "{}" },
      { type: "file", filePath: "vite.config.ts", content: "export default {}" },
      { type: "file", filePath: "App.tsx", content: native()["App.tsx"].content! },
      { type: "start", content: "npm run dev" },
    ];
    expect(nativeTargetFromActions(actions)).toBe(true);
  });
  it("keeps real websites on Vivari, and never retries identical failures on resume", () => {
    expect(shouldUseVivari(false, { "src/App.tsx": { type: "file", content: "export default function App() {}" } })).toBe(true);
    expect(shouldRetryFailedPreview("error", false)).toBe(false);
    expect(shouldRetryFailedPreview("error", true)).toBe(true);
    expect(shouldRetryFailedPreview("ready", false)).toBe(true);
  });
});
