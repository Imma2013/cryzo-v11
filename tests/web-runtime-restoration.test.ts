import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ArtifactAction } from "@/lib/workspace/types";
import { localExportContractIssues } from "@/lib/server/cross-file-contracts";

const mocks = vi.hoisted(() => {
  const files = new Map<string, string>();
  const sandbox = { on: vi.fn(), fs: { exists: vi.fn(async (path: string) => files.has(path)) } };
  return {
    files, sandbox,
    resetSandboxProject: vi.fn(async () => { files.clear(); }),
    writeFiles: vi.fn(async (_sandbox: unknown, actions: ArtifactAction[]) => {
      for (const action of actions) if (action.type === "file" && action.filePath) files.set(action.filePath, action.content);
    }),
    runCommand: vi.fn(async (_sandbox: unknown, command: string, onData: (text: string) => void): Promise<number> => {
      if (command === "npm run build") {
        onData('src/App.tsx(1,1): error TS2322: Type string is not assignable to number.');
        return 2;
      }
      return 0;
    }),
  };
});
vi.mock("@/lib/workspace/sandbox", () => ({
  getSandbox: vi.fn(async () => mocks.sandbox),
  resetSandboxProject: mocks.resetSandboxProject,
  writeFiles: mocks.writeFiles,
  runCommand: mocks.runCommand,
  directoryExists: vi.fn(async () => false),
  teardownSandbox: vi.fn(), rebootSandboxRuntime: vi.fn(), collectDirectoryFiles: vi.fn(),
  isSandboxInfrastructureError: (error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    return ["ERR_BOOT_TIMEOUT", "ERR_BOOT_FAILED", "ERR_WORKER", "ERR_NOT_ISOLATED", "ERR_PREVIEW_SERVICE_WORKER"].includes(code);
  },
}));
vi.mock("@/lib/developer-connections", () => ({ readSupabaseRuntimeContext: () => null }));

const actions: ArtifactAction[] = [
  { type: "file", filePath: "package.json", content: JSON.stringify({ scripts: { dev: "vite", build: "tsc && vite build" }, dependencies: { react: "^19.2.0", "react-dom": "^19.2.0" }, devDependencies: { vite: "^6.3.0", typescript: "^5" } }) },
  { type: "file", filePath: "index.html", content: '<div id="root"></div><script type="module" src="/src/main.tsx"></script>' },
  { type: "file", filePath: "src/main.tsx", content: 'import App from "./App"; export default App;' },
  { type: "file", filePath: "src/App.tsx", content: 'export default function App() { const count: number = "bad"; return <main>{count}</main>; }' },
  { type: "start", content: "npm run dev" },
];

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.files.clear();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    if (body.operation === "project") {
      const files = Object.fromEntries(body.projectFiles.map((file: { path: string; content: string }) => [file.path, { type: "file", content: file.content }]));
      const issues = localExportContractIssues(files);
      if (issues.length) return { ok: false, json: async () => ({ error: issues.join("\n") }) };
    }
    return { ok: true, json: async () => ({ actions: body.actions, action: body.action }) };
  }));
});

describe("web restoration validation and repair", () => {
  it("forwards package-manager diagnostics to repair when installation fails", async () => {
    mocks.runCommand.mockImplementationOnce(async (_sandbox, _command, onData) => {
      onData("npm error ERESOLVE unable to resolve dependency tree");
      return 1;
    });
    const runtime = await import("@/lib/workspace/streaming-runtime");
    runtime.setStreamingRuntimeAuthToken("test-token");
    const repair = vi.fn();
    window.addEventListener("cryzo:project-repair-needed", repair);
    await runtime.restoreStreamingRuntime("install-failed", actions);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][0].detail.message).toContain("ERESOLVE");
    expect(mocks.runCommand.mock.calls.some(([, command]) => command === "npm run build")).toBe(false);
  });

  it("clears orphaned persisted files before validating and building the restored snapshot", async () => {
    mocks.files.set("src/components/StalePage.tsx", 'import { Missing } from "../types"');
    const runtime = await import("@/lib/workspace/streaming-runtime");
    runtime.setStreamingRuntimeAuthToken("test-token");
    const repair = vi.fn();
    window.addEventListener("cryzo:project-repair-needed", repair);
    await runtime.restoreStreamingRuntime("web-restored", actions);
    expect(mocks.resetSandboxProject).toHaveBeenCalledTimes(1);
    expect(mocks.files.has("src/components/StalePage.tsx")).toBe(false);
    expect(mocks.files.has("src/App.tsx")).toBe(true);
    expect(runtime.getStreamingRuntimeSnapshot("web-restored").progress).toBe("error");
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][0].detail).toMatchObject({ conversationId: "web-restored", message: expect.stringContaining("TS2322") });
    expect(mocks.runCommand.mock.calls.filter(([, command]) => command === "npm run build")).toHaveLength(1);
  });

  it("sends missing shared type exports to repair before compiling any website", async () => {
    const runtime = await import("@/lib/workspace/streaming-runtime");
    runtime.setStreamingRuntimeAuthToken("test-token");
    const repair = vi.fn();
    window.addEventListener("cryzo:project-repair-needed", repair);
    await runtime.restoreStreamingRuntime("missing-contract", [
      ...actions,
      { type: "file", filePath: "src/types.ts", content: "export interface User { name: string }" },
      { type: "file", filePath: "src/components/Team.tsx", content: 'import type { Team } from "../types"; export const team: Team = {};' },
    ]);
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][0].detail.message).toContain('does not export "Team"');
    expect(mocks.runCommand.mock.calls.some(([, command]) => command === "npm run build")).toBe(false);
  });

  it("does not send Vivari infrastructure failures to automatic project repair", async () => {
    const bootError = Object.assign(new Error("Vivari.boot() did not complete within 45000ms"), { code: "ERR_BOOT_TIMEOUT" });
    const sandboxModule = await import("@/lib/workspace/sandbox");
    const getSandboxMock = vi.mocked(sandboxModule.getSandbox);
    getSandboxMock.mockRejectedValueOnce(bootError);

    const runtime = await import("@/lib/workspace/streaming-runtime");
    runtime.setStreamingRuntimeAuthToken("test-token");
    const repair = vi.fn();
    window.addEventListener("cryzo:project-repair-needed", repair);

    const artifact = `<cryzoArtifact id="runtime-failure" title="Web app">
<cryzoAction type="file" filePath="package.json">{"scripts":{"dev":"vite"},"dependencies":{"react":"^19.2.0","react-dom":"^19.2.0"},"devDependencies":{"vite":"^6.3.0"}}</cryzoAction>
</cryzoArtifact>`;
    runtime.processStreamingArtifactText("runtime-infra-failure", "ai-runtime", artifact, "Build a website");

    await vi.waitFor(() => expect(runtime.getStreamingRuntimeSnapshot("runtime-infra-failure").progress).toBe("error"));
    expect(repair).not.toHaveBeenCalled();
    expect(runtime.getStreamingRuntimeSnapshot("runtime-infra-failure").error).toContain("Vivari.boot");
  });

});
