import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expoStarterFiles } from "@/lib/workspace/expo-starter";
const fixture = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  commands: [] as any[],
  options: [] as any[],
}));
vi.mock("@vercel/sandbox", () => ({
  Sandbox: {
    getOrCreate: vi.fn(async (options: any) => {
      fixture.options.push(options);
      return {
        domain: (port: number) => `https://preview-${port}.example.test`,
        readFileToBuffer: async ({ path }: { path: string }) =>
          fixture.files.get(path) || null,
        writeFiles: async (files: any[]) => {
          for (const file of files)
            fixture.files.set(file.path, Buffer.from(file.content));
        },
        getCommand: async () => ({ kill: async () => {} }),
        runCommand: async (command: any, args?: string[]) => {
          fixture.commands.push(command);
          const text =
            typeof command === "string"
              ? command
              : command.args?.join(" ") || "";
          let output = "";
          if (text.includes("bundledNativeModules"))
            output = JSON.stringify({
              native: ["expo", "react-native"],
              bundled: ["expo", "react-native"],
            });
          if (text.includes("_expo/open"))
            output = JSON.stringify({
              runtime: "expo",
              url: "exp://live-tunnel.example.test",
            });
          if (text.includes("cat .cryzo-expo-preview.log"))
            output = "Tunnel ready";
          return {
            exitCode: 0,
            cmdId: `command-${fixture.commands.length}`,
            stdout: async () => output,
            stderr: async () => "",
          };
        },
      };
    }),
  },
}));
import { runExpoTask } from "@/lib/server/mobile-handler";
beforeEach(() => {
  fixture.files.clear();
  fixture.commands = [];
  fixture.options = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
describe("Expo startup lifecycle", () => {
  it("publishes the real device URL without waiting for a web bundle and reuses Metro even when web was unavailable", async () => {
    const input = {
      operation: "preview" as const,
      conversationId: "fixture",
      sourceFiles: expoStarterFiles(),
    };
    const phase = vi.fn(async () => {});
    const first = runExpoTask(input, phase, new AbortController().signal);
    await vi.runAllTimersAsync();
    const result = await first;
    expect(result.deviceUrl).toBe("exp://live-tunnel.example.test");
    expect(fixture.options[0].timeout).toBeLessThanOrEqual(45 * 60 * 1000);
    expect(
      fixture.commands.some(
        (c) => c.detached && c.args?.join(" ").includes("expo/bin/cli start"),
      ),
    ).toBe(true);
    expect(
      fixture.commands.some((c) => c.args?.join(" ").includes("45000")),
    ).toBe(false);
    const installs = fixture.commands.filter((c) =>
      c.args?.join(" ").includes("npm install"),
    ).length;
    const marker = "/vercel/sandbox/project/.cryzo-expo-runtime.json";
    const saved = JSON.parse(fixture.files.get(marker)!.toString());
    saved.webReady = false;
    fixture.files.set(marker, Buffer.from(JSON.stringify(saved)));
    const next = await runExpoTask(
      {
        ...input,
        sourceFiles: input.sourceFiles.map((f) =>
          f.path === "App.tsx" ? { ...f, content: f.content + "\n// edit" } : f,
        ),
      },
      phase,
      new AbortController().signal,
    );
    expect(next.deviceUrl).toBe(result.deviceUrl);
    expect(
      fixture.commands.filter((c) => c.args?.join(" ").includes("npm install")),
    ).toHaveLength(installs);
    expect(next.sourceRevision).not.toBe(result.sourceRevision);
  });
});
