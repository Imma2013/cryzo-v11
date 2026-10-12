import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ArtifactAction } from "@/lib/workspace/types";

const { getSandbox } = vi.hoisted(() => ({
  getSandbox: vi.fn(async () => { throw new Error("Vivari should never boot for Expo"); }),
}));
vi.mock("@/lib/workspace/sandbox", () => ({
  getSandbox,
  rebootSandboxRuntime: vi.fn(),
  collectDirectoryFiles: vi.fn(),
  directoryExists: vi.fn(),
  runCommand: vi.fn(),
  teardownSandbox: vi.fn(),
  writeFiles: vi.fn(),
}));

const actions: ArtifactAction[] = [
  { type: "file", filePath: "package.json", content: JSON.stringify({ name: "calorie-app", scripts: { build: "tsc && vite build", dev: "vite" }, dependencies: { react: "19.2.3" } }) },
  { type: "file", filePath: "vite.config.ts", content: "export default {}" },
  { type: "file", filePath: "src/web.tsx", content: "import { View } from 'react-native'" },
  { type: "file", filePath: "App.tsx", content: "import { View } from 'react-native'; export default function App() { return <View/> }" },
  { type: "start", content: "npm run dev" },
];

let runtime: typeof import("@/lib/workspace/streaming-runtime");
beforeAll(async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(String(init.body || "{}"));
    return { ok: true, json: async () => ({ actions: input.actions || [], action: input.action, output: "" }) };
  }));
  runtime = await import("@/lib/workspace/streaming-runtime");
  runtime.setStreamingRuntimeAuthToken("test-token");
}, 60000);

describe("native restoration without Vivari", () => {
  it("builds a new mobile app from streamed files without booting Vivari or Vite", async () => {
    const artifact = `<cryzoArtifact id="mobile-smoke" title="Calorie tracker">
<cryzoAction type="file" filePath="App.tsx">import { View } from "react-native"; export default function App() { return <View/> }</cryzoAction>
<cryzoAction type="start">npm start</cryzoAction></cryzoArtifact>`;
    runtime.processStreamingArtifactText("native-stream-regression", "ai-1", artifact, "Build a mobile app for calorie tracking");
    await vi.waitFor(() => {
      const snapshot = runtime.getStreamingRuntimeSnapshot("native-stream-regression");
      expect(snapshot.progress).toBe("ready");
      expect(snapshot.error).toBeNull();
    }, { timeout: 10000 });
    expect(getSandbox).not.toHaveBeenCalled();
  }, 15000);
  it("restores a mixed Vite + Expo artifact as Expo and never boots the browser worker", async () => {
    await runtime.restoreStreamingRuntime("native-restore-regression", actions, true);
    const restored = runtime.getStreamingRuntimeSnapshot("native-restore-regression");
    expect(restored.progress).toBe("ready");
    expect(restored.files["vite.config.ts"]).toBeUndefined();
    expect(restored.files["src/web.tsx"]).toBeUndefined();
    expect(JSON.parse(restored.files["package.json"].content!).scripts.start).toBe("expo start");
    expect(restored.files["App.tsx"].content).toContain("react-native");
    expect(getSandbox).not.toHaveBeenCalled();
  });
  it("ignores repeated background recovery and refreshes native preview without Vite", async () => {
    await runtime.recoverStreamingRuntime("native-restore-regression", actions, true, true);
    await runtime.restartStreamingRuntime("native-restore-regression");
    expect(getSandbox).not.toHaveBeenCalled();
    expect(runtime.getStreamingRuntimeSnapshot("native-restore-regression").error).toBeNull();
  });
});
