import type { FileMap } from "./types";

/** Pinned to the Expo SDK 57 official blank TypeScript template family. */
export const EXPO_STARTER_VERSION = "57.0.17";

export const EXPO_STARTER_PACKAGE = {
  name: "cryzo-native-app",
  version: "1.0.0",
  private: true,
  main: "index.ts",
  scripts: {
    start: "expo start",
    android: "expo start --android",
    ios: "expo start --ios",
    web: "expo start --web",
    typecheck: "tsc --noEmit --noUnusedLocals false --noUnusedParameters false",
  },
  dependencies: {
    expo: "~57.0.17",
    "expo-status-bar": "~57.0.1",
    react: "19.2.3",
    "react-native": "0.86.3",
    "react-dom": "19.2.3",
    "react-native-web": "~0.21.0",
    "@expo/metro-runtime": "~57.0.16",
  },
  devDependencies: { "@types/react": "~19.2.2", typescript: "~6.0.3" },
};

/** Framework config belongs to Cryzo, not to an LLM's best guess. */
export function expoStarterFiles(): Array<{ path: string; content: string }> {
  return [
    { path: "package.json", content: JSON.stringify(EXPO_STARTER_PACKAGE, null, 2) + "\n" },
    { path: "app.json", content: JSON.stringify({ expo: {
      name: "Cryzo App", slug: "cryzo-native-app", version: "1.0.0", orientation: "portrait",
      userInterfaceStyle: "automatic", ios: { supportsTablet: true }, android: {}, web: { bundler: "metro" },
    } }, null, 2) + "\n" },
    { path: "tsconfig.json", content: JSON.stringify({ extends: "expo/tsconfig.base", compilerOptions: { strict: true },
      include: ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"], exclude: ["node_modules"] }, null, 2) + "\n" },
    { path: "index.ts", content: 'import "@expo/metro-runtime";\nimport { registerRootComponent } from "expo";\nimport App from "./App";\nregisterRootComponent(App);\n' },
    { path: "App.tsx", content: 'import { StatusBar } from "expo-status-bar";\nimport { StyleSheet, Text, View } from "react-native";\n\nexport default function App() {\n  return <View style={styles.screen}><Text style={styles.title}>Your Cryzo app</Text><StatusBar style="auto" /></View>;\n}\n\nconst styles = StyleSheet.create({screen: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }, title: { fontSize: 28, fontWeight: "700" }});\n' },
  ];
}

export function isExpoProject(files: FileMap): boolean {
  const raw = files["package.json"]?.content;
  if (!raw) return false;
  try { const pkg = JSON.parse(raw); return !!(pkg.dependencies?.expo && pkg.dependencies?.["react-native"]); }
  catch { return false; }
}

/** Preserve SDK compatibility but allow real additional dependencies from generated source. */
export function reconcileExpoPackage(proposedContent: string, currentContent?: string): string {
  let proposed: Record<string, unknown>;
  try { proposed = JSON.parse(proposedContent); }
  catch { throw new Error("Generated Expo package.json is malformed JSON."); }
  if (!proposed || typeof proposed !== "object" || Array.isArray(proposed)) throw new Error("Expo package.json must be an object.");
  let current: Record<string, unknown> = {};
  try { current = currentContent ? JSON.parse(currentContent) : {}; } catch { /* use verified baseline */ }
  const known = EXPO_STARTER_PACKAGE;
  const readDeps = (pkg: Record<string, unknown>, field: "dependencies" | "devDependencies") => {
    const deps = pkg[field]; return deps && typeof deps === "object" && !Array.isArray(deps) ? deps as Record<string, string> : {};
  };
  const dependencies = { ...known.dependencies, ...readDeps(current,"dependencies"), ...readDeps(proposed,"dependencies") } as Record<string,string>;
  const devDependencies = { ...known.devDependencies, ...readDeps(current,"devDependencies"), ...readDeps(proposed,"devDependencies") } as Record<string,string>;
  // Never let generated Vite-only versions replace Expo's tested SDK/React Native trio.
  for (const [name, version] of Object.entries(known.dependencies)) dependencies[name] = version;
  for (const [name, version] of Object.entries(known.devDependencies)) devDependencies[name] = version;
  for (const name of ["vite", "@vitejs/plugin-react"]) { delete dependencies[name]; delete devDependencies[name]; }
  const final = { ...current, ...proposed, name: String(proposed.name || current.name || known.name),
    private: true, main: known.main, scripts: { ...known.scripts }, dependencies, devDependencies };
  return JSON.stringify(final, null, 2) + "\n";
}

export function isViteOnlyMobileArtifact(path: string): boolean {
  return /^(?:vite\.config\.[cm]?[jt]s|index\.html|src\/web\.[jt]sx?|src\/web\.css|src\/main\.[jt]sx?)$/i.test(path);
}
