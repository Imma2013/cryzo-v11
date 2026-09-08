import { Sandbox } from "@vercel/sandbox";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { generateText } from "ai";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  canUseManagedMobileBuilds,
  canUseManagedStoreSubmission,
} from "@/lib/billing/entitlements";
import { resolveServerModel } from "@/lib/server/model-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEGACY_MOBILE_DIR = "/vercel/sandbox/mobile-wrapper";
const SOURCE_PROJECT_DIR = "/vercel/sandbox/project";
const MOBILE_TIMEOUT_MS = 45 * 60 * 60 * 1000;
const SOURCE_PREVIEW_PORT = 5173;
const EXPO_PREVIEW_PORT = 8081;
const MAX_SOURCE_FILES = 180;
const MAX_SOURCE_FILE_BYTES = 300_000;
const MAX_SOURCE_BYTES = 3_000_000;
const INTERNAL_SCAN_MODEL = "cryzo/nemotron-3.5-lightning-free";

type Platform = "ios" | "android";
type SourceType = "expo-native" | "expo-webview";
type ScanStatus = "pass" | "warning" | "blocking";
type SourceFile = { path: string; content: string };
type StoreReadinessCheck = {
  id: string;
  title: string;
  status: ScanStatus;
  detail: string;
  fix?: string;
};
type StoreReadinessReport = {
  overall: "ready" | "almost-ready" | "needs-improvement" | "not-ready";
  summary: string;
  checks: StoreReadinessCheck[];
  counts: { pass: number; warning: number; blocking: number };
  aiEnhanced?: boolean;
};
type IosSubmitCredentials = {
  keyContent?: string;
  keyId?: string;
  issuerId?: string;
  appleTeamId?: string;
  ascAppId?: string;
};
type AndroidSubmitCredentials = {
  serviceAccountJson?: string;
  track?: "internal" | "alpha" | "beta" | "production";
};
type MobileRequest = {
  operation: "check" | "preview" | "build" | "status" | "submit";
  conversationId: string;
  sourceFiles?: SourceFile[];
  expoToken?: string;
  expoAccount?: string;
  appName?: string;
  identifier?: string;
  webUrl?: string;
  platform?: Platform;
  buildId?: string;
  iosSubmit?: IosSubmitCredentials;
  androidSubmit?: AndroidSubmitCredentials;
};
type Workspace = {
  sandbox: Sandbox;
  cwd: string;
  sourceType: SourceType;
};

function bearer(req: Request) {
  const value = req.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "cryzo-app"
  );
}

function safeIdentifier(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
  return cleaned || "com.cryzo.app";
}

async function requireConversation(req: Request, conversationId: string) {
  const token = bearer(req);
  if (!token) throw new Error("Unauthorized");
  const conversation = await fetchQuery(
    api.conversations.get,
    { id: conversationId as Id<"conversations"> },
    { token },
  );
  if (!conversation) throw new Error("Conversation not found");
  return { token, conversation };
}

function legacySandboxNameFor(conversationId: string) {
  return `cryzo-mobile-${conversationId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 42)}`;
}

function sourceSandboxNameFor(conversationId: string) {
  return `cryzo-${conversationId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48)}`;
}

async function getLegacySandbox(conversationId: string) {
  return await Sandbox.getOrCreate({
    name: legacySandboxNameFor(conversationId),
    runtime: "node24",
    timeout: MOBILE_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    networkPolicy: "allow-all",
    onCreate: async (sandbox) => {
      await sandbox.runCommand("mkdir", ["-p", LEGACY_MOBILE_DIR]);
    },
  });
}

async function getSourceSandbox(conversationId: string) {
  return await Sandbox.getOrCreate({
    name: sourceSandboxNameFor(conversationId),
    runtime: "node24",
    ports: [SOURCE_PREVIEW_PORT, EXPO_PREVIEW_PORT],
    timeout: MOBILE_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    networkPolicy: "allow-all",
    onCreate: async (sandbox) => {
      await sandbox.runCommand("mkdir", ["-p", SOURCE_PROJECT_DIR]);
    },
  });
}

function isNativeConversation(conversation: {
  projectPlatforms?: Array<"web" | "ios" | "android">;
}) {
  return Boolean(
    conversation.projectPlatforms?.some(
      (platform) => platform === "ios" || platform === "android",
    ),
  );
}

async function workspaceFor(
  conversationId: string,
  nativeTarget: boolean,
): Promise<Workspace> {
  if (nativeTarget) {
    return {
      sandbox: await getSourceSandbox(conversationId),
      cwd: SOURCE_PROJECT_DIR,
      sourceType: "expo-native",
    };
  }
  return {
    sandbox: await getLegacySandbox(conversationId),
    cwd: LEGACY_MOBILE_DIR,
    sourceType: "expo-webview",
  };
}

async function run(
  workspace: Workspace,
  command: string,
  env?: Record<string, string>,
  allowFailure = false,
) {
  const result = await workspace.sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    cwd: workspace.cwd,
    env,
  });
  const stdout = await result.stdout();
  const stderr = await result.stderr();
  const output = [stdout, stderr].filter(Boolean).join("\n").trim();
  if (result.exitCode !== 0 && !allowFailure) {
    throw new Error(output || `Command failed (${result.exitCode})`);
  }
  return { exitCode: result.exitCode, output };
}

function safeSourceFiles(files?: SourceFile[]) {
  if (!Array.isArray(files)) return [];
  const accepted: SourceFile[] = [];
  let total = 0;
  for (const item of files.slice(0, MAX_SOURCE_FILES)) {
    const path = String(item?.path || "").replace(/^\/+/, "").replace(/\\/g, "/");
    const content = typeof item?.content === "string" ? item.content : "";
    if (!path || path.includes("..")) continue;
    if (
      /(^|\/)(node_modules|\.git|\.next|dist|build|\.cache|\.expo|\.cryzo-credentials)(\/|$)/.test(path) ||
      /(^|\/)\.env($|\.)/.test(path) ||
      /(?:^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(path)
    ) {
      continue;
    }
    const bytes = Buffer.byteLength(content, "utf8");
    if (bytes > MAX_SOURCE_FILE_BYTES || total + bytes > MAX_SOURCE_BYTES) continue;
    total += bytes;
    accepted.push({ path, content });
  }
  return accepted;
}

async function syncNativeSource(workspace: Workspace, sourceFiles?: SourceFile[]) {
  if (workspace.sourceType !== "expo-native") return 0;
  const files = safeSourceFiles(sourceFiles);
  if (!files.length) return 0;
  await run(
    workspace,
    `rm -rf ${JSON.stringify(workspace.cwd)} && mkdir -p ${JSON.stringify(workspace.cwd)}`,
    undefined,
    true,
  );
  await workspace.sandbox.writeFiles(
    files.map((file) => ({
      path: `${workspace.cwd}/${file.path}`,
      content: Buffer.from(file.content, "utf8"),
    })),
  );
  return files.length;
}

function baseEasJson() {
  return {
    cli: { version: ">= 16.0.0", appVersionSource: "remote" },
    build: {
      production: { distribution: "store", autoIncrement: true },
      development: { developmentClient: true, distribution: "internal" },
    },
    submit: { production: {} },
  };
}

function legacyWrapperFiles({
  appName,
  slug,
  webUrl,
  identifier,
}: {
  appName: string;
  slug: string;
  webUrl: string;
  identifier: string;
}) {
  const packageJson = {
    name: slug,
    version: "1.0.0",
    private: true,
    main: "node_modules/expo/AppEntry.js",
    scripts: { start: "expo start" },
    dependencies: {
      expo: "~57.0.0",
      react: "19.2.3",
      "react-native": "0.86.0",
      "react-native-webview": "13.16.1",
    },
    devDependencies: {},
  };
  const appJson = {
    expo: {
      name: appName,
      slug,
      version: "1.0.0",
      orientation: "default",
      userInterfaceStyle: "automatic",
      ios: { bundleIdentifier: identifier, supportsTablet: true },
      android: { package: identifier },
      extra: { cryzoWebUrl: webUrl },
    },
  };
  const appSource = `import React from "react";\nimport { SafeAreaView, StyleSheet } from "react-native";\nimport { WebView } from "react-native-webview";\n\nconst WEB_URL = ${JSON.stringify(webUrl)};\n\nexport default function App() {\n  return <SafeAreaView style={styles.container}><WebView source={{ uri: WEB_URL }} style={styles.webview} startInLoadingState javaScriptEnabled domStorageEnabled allowsBackForwardNavigationGestures sharedCookiesEnabled thirdPartyCookiesEnabled originWhitelist={["https://*", "http://*"]} /></SafeAreaView>;\n}\n\nconst styles = StyleSheet.create({ container: { flex: 1, backgroundColor: "#000" }, webview: { flex: 1 } });\n`;
  return [
    { path: `${LEGACY_MOBILE_DIR}/package.json`, content: Buffer.from(JSON.stringify(packageJson, null, 2), "utf8") },
    { path: `${LEGACY_MOBILE_DIR}/app.json`, content: Buffer.from(JSON.stringify(appJson, null, 2), "utf8") },
    { path: `${LEGACY_MOBILE_DIR}/eas.json`, content: Buffer.from(JSON.stringify(baseEasJson(), null, 2), "utf8") },
    { path: `${LEGACY_MOBILE_DIR}/App.js`, content: Buffer.from(appSource, "utf8") },
  ];
}

async function readJsonFile(
  workspace: Workspace,
  fileName: string,
): Promise<Record<string, any> | null> {
  const buffer = await workspace.sandbox.readFileToBuffer({ path: `${workspace.cwd}/${fileName}` });
  if (!buffer) return null;
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}

async function hasNativeExpoSource(workspace: Workspace) {
  if (workspace.sourceType !== "expo-native") return false;
  const packageJson = await readJsonFile(workspace, "package.json");
  if (!packageJson) return false;
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  return Boolean(dependencies.expo && dependencies["react-native"]);
}

async function collectNativeSource(workspace: Workspace) {
  if (workspace.sourceType !== "expo-native") return "";
  const result = await run(
    workspace,
    `find . -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.json' \\) -not -path './node_modules/*' -not -path './.git/*' -not -path './.expo/*' -print0 | xargs -0 cat 2>/dev/null | head -c 600000`,
    undefined,
    true,
  );
  return result.output;
}

function hasPattern(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function readinessOverall(checks: StoreReadinessCheck[]): StoreReadinessReport["overall"] {
  const blocking = checks.filter((check) => check.status === "blocking").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  if (blocking >= 2) return "not-ready";
  if (blocking === 1) return "needs-improvement";
  if (warnings > 0) return "almost-ready";
  return "ready";
}

function countsFor(checks: StoreReadinessCheck[]) {
  return checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warning: 0, blocking: 0 },
  );
}

async function aiNativeReview(
  source: string,
  checks: StoreReadinessCheck[],
  body: MobileRequest,
) {
  if (!source.trim() || !process.env.OPENROUTER_API_KEY?.trim()) return [] as StoreReadinessCheck[];
  try {
    const resolved = await resolveServerModel({
      providerId: "cryzo",
      modelId: INTERNAL_SCAN_MODEL,
      credentialMode: "cryzo",
    });
    const deterministic = checks
      .filter((check) => check.status !== "pass")
      .map((check) => `${check.title}: ${check.detail}`)
      .join("\n");
    const result = await generateText({
      model: resolved.model,
      system: `You are Cryzo's mobile store-readiness reviewer. Review Expo/React Native source for semantic mobile UX and App Store/Google Play risks that deterministic checks can miss. Focus on native-like layouts, touch targets, keyboard behavior, navigation consistency, permission UX, loading/error states, accessibility, and platform-inappropriate browser assumptions. Do not repeat deterministic issues. Never request secrets. Return ONLY compact JSON with this shape: {"issues":[{"title":"...","detail":"...","fix":"..."}]}. Report at most 5 concrete issues. If there are no additional issues return {"issues":[]}.`,
      prompt: `Target: ${body.platform || "iOS and Android"}\nApp: ${body.appName || "Untitled"}\nDeterministic findings:\n${deterministic || "None"}\n\nSOURCE:\n${source.slice(0, 500000)}`,
      maxOutputTokens: 1800,
    });
    const cleaned = result.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(cleaned) as {
      issues?: Array<{ title?: string; detail?: string; fix?: string }>;
    };
    return (parsed.issues || [])
      .filter((issue) => issue.title?.trim() && issue.detail?.trim())
      .slice(0, 5)
      .map((issue, index) => ({
        id: `ai-native-review-${index + 1}`,
        title: issue.title!.trim().slice(0, 120),
        status: "warning" as const,
        detail: issue.detail!.trim().slice(0, 800),
        fix: issue.fix?.trim().slice(0, 800),
      }));
  } catch (error) {
    console.warn("Nemotron store-readiness enhancement unavailable", error);
    return [] as StoreReadinessCheck[];
  }
}

async function scanStoreReadiness(
  workspace: Workspace,
  body: MobileRequest,
  nativeSourceReady: boolean,
): Promise<StoreReadinessReport> {
  const checks: StoreReadinessCheck[] = [];
  const packageJson = await readJsonFile(workspace, "package.json");
  const appJson = await readJsonFile(workspace, "app.json");
  const source = await collectNativeSource(workspace);
  const sourceLower = source.toLowerCase();
  const expo = (appJson?.expo || {}) as Record<string, any>;
  const appConfigText = JSON.stringify(expo);

  if (workspace.sourceType === "expo-native") {
    checks.push(
      nativeSourceReady
        ? { id: "native-source", title: "Native source", status: "pass", detail: "Expo and React Native source are present in the current Cryzo project." }
        : { id: "native-source", title: "Native source", status: "blocking", detail: "This project is marked mobile but the current source does not contain a usable Expo/React Native project.", fix: "Ask Cryzo to regenerate the project as a native Expo app." },
    );
  } else {
    checks.push({ id: "native-source", title: "Native-like layout", status: "warning", detail: "This project will ship through Cryzo's compatibility WebView wrapper instead of native Expo source.", fix: "Regenerate it with iOS or Android selected for a fully native Expo project." });
  }

  const identityReady = Boolean(body.appName?.trim() && body.identifier?.trim());
  checks.push(identityReady
    ? { id: "identity", title: "App identity", status: "pass", detail: "App name and bundle/package identifier are configured." }
    : { id: "identity", title: "App identity", status: "blocking", detail: "The app needs a name and stable bundle/package identifier before store submission.", fix: "Set an app name and a reverse-domain identifier such as com.company.app." });

  if (workspace.sourceType === "expo-native") {
    const safeArea = hasPattern(source, /SafeAreaView|react-native-safe-area-context|useSafeAreaInsets|safeAreaInsets/i);
    checks.push({ id: "safe-area", title: "Safe area handling", status: safeArea ? "pass" : "warning", detail: safeArea ? "Native safe-area handling was detected." : "No clear safe-area handling was found for notches and system bars.", fix: safeArea ? undefined : "Use react-native-safe-area-context or SafeAreaView around top-level screens." });

    const navigation = hasPattern(source, /expo-router|@react-navigation|BackHandler|router\.back|navigation\.goBack|canGoBack/i);
    checks.push({ id: "navigation", title: "Navigation & back stack", status: navigation ? "pass" : "warning", detail: navigation ? "Native navigation/back-stack APIs were detected." : "No native navigation or back-stack implementation was detected.", fix: navigation ? undefined : "Use Expo Router or React Navigation when the app has multiple screens." });

    const darkMode = expo.userInterfaceStyle === "automatic" || hasPattern(source, /useColorScheme|colorScheme|darkMode|theme.*dark|dark:/i);
    checks.push({ id: "dark-mode", title: "Dark mode & theming", status: darkMode ? "pass" : "warning", detail: darkMode ? "Automatic or explicit system theming was detected." : "No clear system-theme handling was detected.", fix: darkMode ? undefined : "Use userInterfaceStyle: automatic and map colors to the device color scheme." });

    const webOnlyApis = hasPattern(source, /\bdocument\.|\blocalStorage\b|\bsessionStorage\b|\bwindow\.location\b/);
    checks.push({ id: "native-apis", title: "Native API compatibility", status: webOnlyApis ? "warning" : "pass", detail: webOnlyApis ? "Browser-only APIs appear in native source and may fail on device." : "No obvious browser-only APIs were detected in native source.", fix: webOnlyApis ? "Replace browser storage/navigation APIs with React Native or Expo equivalents, or guard them by platform." : undefined });

    const hardcodedSecret = hasPattern(source, /(?:sk-[A-Za-z0-9_-]{24,}|nvapi-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|sb_secret_[A-Za-z0-9_-]{12,})/);
    checks.push({ id: "secrets", title: "Secrets & credentials", status: hardcodedSecret ? "blocking" : "pass", detail: hardcodedSecret ? "A token-like secret appears hard-coded in source that could ship to the store." : "No obvious provider secrets were detected in scanned source.", fix: hardcodedSecret ? "Move private keys to server-side environment variables and rotate any committed key." : undefined });

    const createsAccounts = hasPattern(source, /signUp|signup|createUser|createAccount|registerUser|register\(/i);
    const deletesAccounts = hasPattern(source, /deleteAccount|deleteUser|removeAccount|account deletion|delete account/i);
    checks.push({ id: "account-deletion", title: "Account deletion", status: createsAccounts && !deletesAccounts ? "blocking" : "pass", detail: createsAccounts && !deletesAccounts ? "Account creation exists but no in-app account deletion path was found." : createsAccounts ? "Account creation and deletion flows were both detected." : "No account-creation flow was detected.", fix: createsAccounts && !deletesAccounts ? "Add a visible in-app Delete Account flow that deletes or initiates deletion of the user's account and data." : undefined });

    const usesSensitiveApis = hasPattern(source, /expo-camera|CameraView|ImagePicker|expo-location|Location\.|Notifications\.|expo-notifications|Microphone|Contacts\./i);
    const permissionCopy = hasPattern(appConfigText, /NSCameraUsageDescription|NSPhotoLibraryUsageDescription|NSLocationWhenInUseUsageDescription|NSMicrophoneUsageDescription|permissions/i);
    checks.push({ id: "permissions", title: "Permissions & privacy strings", status: usesSensitiveApis && !permissionCopy ? "warning" : "pass", detail: usesSensitiveApis && !permissionCopy ? "Sensitive device APIs are used without clearly detected store-facing permission descriptions." : "Permission usage is absent or paired with app configuration.", fix: usesSensitiveApis && !permissionCopy ? "Add precise iOS usage descriptions and Android permissions only for capabilities the app actually uses." : undefined });

    const hasStoreAssets = Boolean(expo.icon || expo.splash || expo.android?.adaptiveIcon || packageJson?.expo?.icon);
    checks.push({ id: "assets", title: "App icon & launch assets", status: hasStoreAssets ? "pass" : "warning", detail: hasStoreAssets ? "App icon or splash/adaptive-icon configuration was detected." : "No app icon or splash/adaptive-icon configuration was detected.", fix: hasStoreAssets ? undefined : "Add a production app icon, Android adaptive icon and launch/splash assets before submitting." });

    const hasPrivacy = sourceLower.includes("privacy") || appConfigText.toLowerCase().includes("privacy");
    checks.push({ id: "privacy", title: "Privacy disclosure", status: hasPrivacy ? "pass" : "warning", detail: hasPrivacy ? "Privacy-related copy or configuration was detected." : "No privacy policy or privacy disclosure was found in the scanned project.", fix: hasPrivacy ? undefined : "Add a privacy policy link and ensure store data disclosures match actual behavior." });

    const usesPayments = hasPattern(source, /stripe|checkout|subscription|digital purchase|purchase\(/i);
    const usesStoreBilling = hasPattern(source, /react-native-iap|expo-in-app-purchases|RevenueCat|react-native-purchases|StoreKit|BillingClient/i);
    checks.push({ id: "payments", title: "Digital payments", status: usesPayments && !usesStoreBilling ? "warning" : "pass", detail: usesPayments && !usesStoreBilling ? "Payment/subscription code was detected without an obvious App Store / Play billing implementation." : "No obvious digital-goods billing conflict was detected.", fix: usesPayments && !usesStoreBilling ? "If the app sells digital goods consumed in-app, review Apple's and Google's in-app purchase requirements." : undefined });
  } else {
    checks.push(
      { id: "safe-area", title: "Safe area handling", status: "pass", detail: "Cryzo's compatibility wrapper uses a React Native SafeAreaView around the WebView." },
      { id: "navigation", title: "Navigation & gestures", status: "warning", detail: "The compatibility wrapper supports gestures, but native navigation behavior still depends on the web app.", fix: "Regenerate the project as an Expo-native app for a fully native navigation experience." },
      { id: "dark-mode", title: "Dark mode & theming", status: "pass", detail: "The wrapper follows device appearance automatically; the embedded web app controls its own theme." },
    );
  }

  const aiChecks = workspace.sourceType === "expo-native" && nativeSourceReady
    ? await aiNativeReview(source, checks, body)
    : [];
  checks.push(...aiChecks);
  const counts = countsFor(checks);
  const overall = readinessOverall(checks);
  const summary =
    overall === "ready"
      ? "Ready for store build preparation."
      : overall === "almost-ready"
        ? `No blocking source issues found. Review ${counts.warning} warning${counts.warning === 1 ? "" : "s"} before submission.`
        : overall === "needs-improvement"
          ? "One blocking issue should be fixed before submission."
          : "Multiple blocking issues should be fixed before submission.";
  return { overall, summary, checks, counts, aiEnhanced: aiChecks.length > 0 };
}

async function startExpoPreview(workspace: Workspace) {
  if (!(await hasNativeExpoSource(workspace))) {
    throw new Error("Generate the Expo/React Native app before previewing it on a phone");
  }
  await run(workspace, "npm install --no-audit --no-fund", undefined, false);
  await run(workspace, "npm install --no-audit --no-fund --no-save @expo/ngrok@^4.1.0", undefined, true);
  await run(
    workspace,
    `if [ -f .cryzo-expo-preview.pid ]; then kill $(cat .cryzo-expo-preview.pid) 2>/dev/null || true; fi; rm -f .cryzo-expo-preview.log; (CI=1 EXPO_NO_TELEMETRY=1 npx expo start --tunnel --port ${EXPO_PREVIEW_PORT} > .cryzo-expo-preview.log 2>&1 & echo $! > .cryzo-expo-preview.pid)`,
    undefined,
    true,
  );

  let lastOutput = "";
  for (let attempt = 0; attempt < 24; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const logs = await run(workspace, "cat .cryzo-expo-preview.log 2>/dev/null || true", undefined, true);
    lastOutput = logs.output.replace(/\x1b\[[0-9;]*m/g, "");
    const match = lastOutput.match(/\b(exps?:\/\/[^\s"'<>]+)/i);
    if (match?.[1]) {
      return { previewUrl: match[1], output: lastOutput.slice(-6000) };
    }
    if (/CommandError|error:/i.test(lastOutput) && !/waiting|starting/i.test(lastOutput)) break;
  }
  throw new Error(`Expo phone preview could not start. ${lastOutput.slice(-1800)}`.trim());
}

async function configureNativeExpoProject(
  workspace: Workspace,
  appName: string,
  identifierValue: string,
) {
  const packageJson = await readJsonFile(workspace, "package.json");
  if (!packageJson) throw new Error("Generate the mobile app before building it for a store");
  const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
  if (!dependencies.expo || !dependencies["react-native"]) {
    throw new Error("This mobile project is missing Expo or React Native. Ask Cryzo to regenerate it as a native mobile app first");
  }
  const slug = safeSlug(appName);
  const identifier = safeIdentifier(identifierValue);
  const existing = (await readJsonFile(workspace, "app.json")) || {};
  const expo = existing.expo || {};
  const appJson = {
    ...existing,
    expo: {
      ...expo,
      name: appName,
      slug,
      version: expo.version || "1.0.0",
      orientation: expo.orientation || "default",
      userInterfaceStyle: expo.userInterfaceStyle || "automatic",
      ios: { ...(expo.ios || {}), bundleIdentifier: identifier },
      android: { ...(expo.android || {}), package: identifier },
    },
  };
  await workspace.sandbox.writeFiles([
    { path: `${workspace.cwd}/app.json`, content: Buffer.from(JSON.stringify(appJson, null, 2), "utf8") },
    { path: `${workspace.cwd}/eas.json`, content: Buffer.from(JSON.stringify(baseEasJson(), null, 2), "utf8") },
  ]);
}

async function prepareProject(
  workspace: Workspace,
  body: Required<Pick<MobileRequest, "expoToken" | "expoAccount" | "appName" | "identifier" | "platform">> & { webUrl?: string },
) {
  const slug = safeSlug(body.appName);
  const identifier = safeIdentifier(body.identifier);
  if (workspace.sourceType === "expo-native") {
    await configureNativeExpoProject(workspace, body.appName, identifier);
  } else {
    if (!body.webUrl || !/^https:\/\//i.test(body.webUrl)) throw new Error("Legacy mobile wrappers require a published HTTPS web URL");
    await run(workspace, `rm -rf ${JSON.stringify(LEGACY_MOBILE_DIR)} && mkdir -p ${JSON.stringify(LEGACY_MOBILE_DIR)}`, undefined, true);
    await workspace.sandbox.writeFiles(legacyWrapperFiles({ appName: body.appName, slug, webUrl: body.webUrl, identifier }));
  }
  const env = { EXPO_TOKEN: body.expoToken };
  const install = await run(workspace, "npm install --no-audit --no-fund", env);
  const init = await run(workspace, `npx --yes eas-cli@latest init --account ${JSON.stringify(body.expoAccount)} --json --non-interactive`, env);
  let expoProjectId: string | undefined;
  try {
    const parsed = JSON.parse(init.output) as { id?: string; projectId?: string };
    expoProjectId = parsed.id || parsed.projectId;
  } catch {
    expoProjectId = init.output.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i)?.[0];
  }
  return { env, installOutput: install.output, initOutput: init.output, expoProjectId, sourceType: workspace.sourceType };
}

function parseBuildJson(output: string) {
  const trimmed = output.trim();
  const start = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  const jsonStart = start >= 0 && (objectStart < 0 || start < objectStart) ? start : objectStart;
  if (jsonStart < 0) return null;
  try {
    const parsed = JSON.parse(trimmed.slice(jsonStart));
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    return item as {
      id?: string;
      status?: string;
      buildDetailsPageUrl?: string;
      artifacts?: { buildUrl?: string; applicationArchiveUrl?: string };
    };
  } catch {
    return null;
  }
}

async function configureSubmitCredentials(workspace: Workspace, body: MobileRequest) {
  const credentialDir = `${workspace.cwd}/.cryzo-credentials`;
  await run(workspace, `rm -rf ${JSON.stringify(credentialDir)} && mkdir -p ${JSON.stringify(credentialDir)}`);
  if (body.platform === "ios") {
    const credentials = body.iosSubmit;
    if (!credentials?.keyContent?.trim() || !credentials.keyId?.trim() || !credentials.issuerId?.trim() || !credentials.ascAppId?.trim()) {
      throw new Error("iOS submission requires the App Store Connect .p8 key, Key ID, Issuer ID, and App Store Connect App ID");
    }
    const keyFileName = `AuthKey_${credentials.keyId.trim()}.p8`;
    await workspace.sandbox.writeFiles([{ path: `${credentialDir}/${keyFileName}`, content: Buffer.from(credentials.keyContent.trim() + "\n", "utf8") }]);
    const easJson = baseEasJson();
    (easJson.submit.production as any) = {
      ios: {
        ascApiKeyPath: `.cryzo-credentials/${keyFileName}`,
        ascApiKeyIssuerId: credentials.issuerId.trim(),
        ascApiKeyId: credentials.keyId.trim(),
        ascAppId: credentials.ascAppId.trim(),
        ...(credentials.appleTeamId?.trim() ? { appleTeamId: credentials.appleTeamId.trim() } : {}),
      },
    };
    await workspace.sandbox.writeFiles([{ path: `${workspace.cwd}/eas.json`, content: Buffer.from(JSON.stringify(easJson, null, 2), "utf8") }]);
    return;
  }
  if (body.platform === "android") {
    const credentials = body.androidSubmit;
    if (!credentials?.serviceAccountJson?.trim()) throw new Error("Android submission requires a Google Play service-account JSON key");
    try { JSON.parse(credentials.serviceAccountJson); } catch { throw new Error("The Google Play service-account file is not valid JSON"); }
    await workspace.sandbox.writeFiles([{ path: `${credentialDir}/google-service-account.json`, content: Buffer.from(credentials.serviceAccountJson.trim() + "\n", "utf8") }]);
    const easJson = baseEasJson();
    (easJson.submit.production as any) = { android: { serviceAccountKeyPath: ".cryzo-credentials/google-service-account.json", track: credentials.track || "internal", releaseStatus: "draft" } };
    await workspace.sandbox.writeFiles([{ path: `${workspace.cwd}/eas.json`, content: Buffer.from(JSON.stringify(easJson, null, 2), "utf8") }]);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MobileRequest;
    if (!body.conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 });

    const { token: authToken, conversation } = await requireConversation(req, body.conversationId);
    const subscription = await fetchQuery(api.billing.getSubscription, { userId: conversation.userId }, { token: authToken });
    const nativeTarget = isNativeConversation(conversation);
    const workspace = await workspaceFor(body.conversationId, nativeTarget);

    if ((body.operation === "check" || body.operation === "preview" || body.operation === "build") && nativeTarget) {
      await syncNativeSource(workspace, body.sourceFiles);
    }

    if (body.operation === "check") {
      const prerequisiteIssues: string[] = [];
      const nativeSourceReady = nativeTarget ? await hasNativeExpoSource(workspace) : false;
      const storeReadiness = await scanStoreReadiness(workspace, body, nativeSourceReady);
      if (nativeTarget && !nativeSourceReady) prerequisiteIssues.push("Build the mobile project in Cryzo first so its current Expo source is available.");
      if (!nativeTarget && (!body.webUrl || !/^https:\/\//i.test(body.webUrl))) prerequisiteIssues.push("Publish the web app to an HTTPS URL first.");
      if (!body.appName?.trim()) prerequisiteIssues.push("App name is required.");
      if (!body.identifier?.trim()) prerequisiteIssues.push("Bundle/package identifier is required.");
      if (!body.platform) prerequisiteIssues.push("Choose iOS or Android.");

      let webReachable = false;
      if (!nativeTarget && body.webUrl && /^https:\/\//i.test(body.webUrl)) {
        try {
          let response = await fetch(body.webUrl, { method: "HEAD", redirect: "follow", cache: "no-store" });
          if (response.status === 405) response = await fetch(body.webUrl, { method: "GET", redirect: "follow", cache: "no-store" });
          webReachable = response.ok;
          if (!response.ok) prerequisiteIssues.push(`Published web app returned HTTP ${response.status}.`);
        } catch {
          prerequisiteIssues.push("Published web app could not be reached.");
        }
      }

      const sourceBlocking = storeReadiness.checks.filter((check) => check.status === "blocking").map((check) => `${check.title}: ${check.detail}`);
      const issues = [...prerequisiteIssues, ...sourceBlocking];
      const warnings = storeReadiness.checks.filter((check) => check.status === "warning").map((check) => `${check.title}: ${check.detail}`);
      return Response.json({
        success: issues.length === 0,
        ready: issues.length === 0,
        webReachable: nativeTarget ? null : webReachable,
        sourceType: workspace.sourceType,
        wrapperType: workspace.sourceType,
        nativeSourceReady,
        issues,
        warnings,
        storeReadiness,
        plan: subscription.plan,
        managedBuildIncluded: canUseManagedMobileBuilds(subscription.plan),
        managedSubmissionIncluded: canUseManagedStoreSubmission(subscription.plan),
      });
    }

    if (body.operation === "preview") {
      if (!nativeTarget) {
        return Response.json({ error: "Phone preview with Expo Go requires an Expo/React Native project. Select iOS or Android when creating the app." }, { status: 400 });
      }
      const preview = await startExpoPreview(workspace);
      return Response.json({ success: true, sourceType: workspace.sourceType, previewUrl: preview.previewUrl, qrValue: preview.previewUrl });
    }

    if (body.operation === "build" && !canUseManagedMobileBuilds(subscription.plan)) {
      return Response.json({ error: "Cryzo-managed EAS builds require Builder or above. Store-readiness scans, Expo source and phone preview remain available without a managed build.", code: "MANAGED_MOBILE_BUILD_REQUIRES_BUILDER", requiredPlan: "builder" }, { status: 402 });
    }
    if (body.operation === "submit" && !canUseManagedStoreSubmission(subscription.plan)) {
      return Response.json({ error: "One-click App Store / Google Play submission requires Builder or above. You can still export and submit the Expo project yourself.", code: "MANAGED_STORE_SUBMISSION_REQUIRES_BUILDER", requiredPlan: "builder" }, { status: 402 });
    }

    if (!body.expoToken?.trim()) return Response.json({ error: "Missing Expo access token" }, { status: 400 });
    const env = { EXPO_TOKEN: body.expoToken.trim() };

    if (body.operation === "status") {
      if (!body.buildId) return Response.json({ error: "Missing buildId" }, { status: 400 });
      const result = await run(workspace, `npx --yes eas-cli@latest build:view ${JSON.stringify(body.buildId)} --json`, env);
      const build = parseBuildJson(result.output) || {};
      return Response.json({ success: true, sourceType: workspace.sourceType, buildId: body.buildId, status: build.status || "unknown", buildUrl: build.buildDetailsPageUrl, artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl, raw: result.output.slice(-12000) });
    }

    if (body.operation === "submit") {
      if (!body.platform || !body.buildId) return Response.json({ error: "Missing platform or buildId" }, { status: 400 });
      try {
        await configureSubmitCredentials(workspace, body);
        const result = await run(workspace, `npx --yes eas-cli@latest submit --platform ${body.platform} --id ${JSON.stringify(body.buildId)} --profile production --non-interactive --no-wait`, env);
        return Response.json({ success: true, sourceType: workspace.sourceType, status: "submission-started", output: result.output.slice(-12000) });
      } finally {
        await run(workspace, `rm -rf ${JSON.stringify(`${workspace.cwd}/.cryzo-credentials`)}`, env, true);
      }
    }

    if (body.operation !== "build") return Response.json({ error: "Unknown mobile operation" }, { status: 400 });
    if (!body.platform || !body.expoAccount?.trim() || !body.appName?.trim() || !body.identifier?.trim()) {
      return Response.json({ error: "Missing mobile build configuration" }, { status: 400 });
    }
    if (!nativeTarget && (!body.webUrl || !/^https:\/\//i.test(body.webUrl))) {
      return Response.json({ error: "Legacy mobile wrappers require a published HTTPS web URL" }, { status: 400 });
    }

    const prepared = await prepareProject(workspace, {
      expoToken: body.expoToken.trim(),
      expoAccount: body.expoAccount.trim(),
      appName: body.appName.trim(),
      identifier: body.identifier.trim(),
      webUrl: body.webUrl?.trim(),
      platform: body.platform,
    });
    const buildResult = await run(workspace, `npx --yes eas-cli@latest build --platform ${body.platform} --profile production --non-interactive --no-wait --json`, prepared.env);
    const build = parseBuildJson(buildResult.output);
    if (!build?.id) throw new Error(`EAS started but Cryzo could not read the build ID.\n${buildResult.output.slice(-6000)}`);

    await fetchMutation(
      (api as any).mobileBuilds.upsert,
      {
        conversationId: body.conversationId as Id<"conversations">,
        platform: body.platform,
        expoProjectId: prepared.expoProjectId,
        buildId: build.id,
        buildUrl: build.buildDetailsPageUrl,
        artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
        status: build.status || "queued",
        appName: body.appName.trim(),
        identifier: safeIdentifier(body.identifier),
        webUrl: body.webUrl?.trim() || "",
      },
      { token: authToken },
    );

    return Response.json({
      success: true,
      platform: body.platform,
      sourceType: prepared.sourceType,
      wrapperType: prepared.sourceType,
      expoProjectId: prepared.expoProjectId,
      buildId: build.id,
      status: build.status || "queued",
      buildUrl: build.buildDetailsPageUrl,
      artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
      output: [prepared.initOutput, buildResult.output].filter(Boolean).join("\n").slice(-12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mobile build failed";
    const status = message === "Unauthorized" ? 401 : message === "Conversation not found" ? 404 : /requires|invalid|missing|generate|legacy|preview/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
