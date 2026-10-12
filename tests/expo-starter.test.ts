import { describe, expect, it } from "vitest";
import { EXPO_STARTER_PACKAGE, expoStarterFiles, isExpoProject, reconcileExpoPackage, isViteOnlyMobileArtifact } from "@/lib/workspace/expo-starter";
import type { FileMap } from "@/lib/workspace/types";

function base(): FileMap { return Object.fromEntries(expoStarterFiles().map((f) => [f.path, { type: "file", content: f.content }])); }

describe("SDK 57 first-pass native project", () => {
  it("contains an actual Expo entry point and never requires a Vite bridge", () => {
    const files = base();
    expect(isExpoProject(files)).toBe(true);
    expect(files["App.tsx"].content).toContain("react-native");
    expect(files["index.ts"].content).toContain("registerRootComponent");
    expect(files["vite.config.ts"]).toBeUndefined();
    expect(files["index.html"]).toBeUndefined();
    expect(JSON.parse(files["package.json"].content!).scripts.start).toBe("expo start");
  });
  it("includes root App.tsx in real Expo tsconfig so TS18003 cannot occur", () => {
    const tsconfig = JSON.parse(base()["tsconfig.json"].content!);
    expect(tsconfig.extends).toBe("expo/tsconfig.base");
    expect(tsconfig.include).toContain("**/*.tsx");
    expect(tsconfig.include).not.toEqual(["src"]);
  });
  it("pins Expo/React Native versions while merging new dependencies safely", () => {
    const draft = JSON.stringify({ dependencies: { expo: "broken", react: "17", "react-native": "0.60.0", "expo-camera": "~17.0.0", vite: "*" }, scripts: { build: "tsc && vite build" } });
    const fixed = JSON.parse(reconcileExpoPackage(draft));
    expect(fixed.dependencies.expo).toBe(EXPO_STARTER_PACKAGE.dependencies.expo);
    expect(fixed.dependencies["react-native"]).toBe("0.86.3");
    expect(fixed.dependencies["expo-camera"]).toBe("~17.0.0");
    expect(fixed.dependencies.vite).toBeUndefined();
    expect(fixed.scripts.web).toBe("expo start --web");
    expect(fixed.main).toBe("index.ts");
  });
  it("refuses generated web-only files for native apps", () => {
    expect(isViteOnlyMobileArtifact("vite.config.ts")).toBe(true);
    expect(isViteOnlyMobileArtifact("src/web.tsx")).toBe(true);
    expect(isViteOnlyMobileArtifact("index.html")).toBe(true);
    expect(isViteOnlyMobileArtifact("src/screens/Today.tsx")).toBe(false);
  });
});
