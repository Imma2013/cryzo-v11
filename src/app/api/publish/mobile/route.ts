import { Sandbox } from "@vercel/sandbox";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MOBILE_DIR = "/vercel/sandbox/mobile-wrapper";
const MOBILE_TIMEOUT_MS = 45 * 60 * 1000;

type Platform = "ios" | "android";
type MobileRequest = {
  operation: "check" | "build" | "status" | "submit";
  conversationId: string;
  expoToken?: string;
  expoAccount?: string;
  appName?: string;
  identifier?: string;
  webUrl?: string;
  platform?: Platform;
  buildId?: string;
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

function safeIdentifier(value: string, platform: Platform) {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^[.-]+|[.-]+$/g, "");
  if (!cleaned) return platform === "ios" ? "com.cryzo.app" : "com.cryzo.app";
  return cleaned;
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
  return token;
}

function sandboxNameFor(conversationId: string) {
  const safe = conversationId.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 42);
  return `cryzo-mobile-${safe}`;
}

async function getSandbox(conversationId: string) {
  return await Sandbox.getOrCreate({
    name: sandboxNameFor(conversationId),
    runtime: "node24",
    timeout: MOBILE_TIMEOUT_MS,
    persistent: true,
    snapshotExpiration: 7 * 24 * 60 * 60 * 1000,
    networkPolicy: "allow-all",
    onCreate: async (sandbox) => {
      await sandbox.runCommand("mkdir", ["-p", MOBILE_DIR]);
    },
  });
}

async function run(
  sandbox: Sandbox,
  command: string,
  env?: Record<string, string>,
  allowFailure = false,
) {
  const result = await sandbox.runCommand({
    cmd: "sh",
    args: ["-lc", command],
    cwd: MOBILE_DIR,
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

function wrapperFiles({
  appName,
  slug,
  webUrl,
  iosIdentifier,
  androidIdentifier,
}: {
  appName: string;
  slug: string;
  webUrl: string;
  iosIdentifier: string;
  androidIdentifier: string;
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
      ios: {
        bundleIdentifier: iosIdentifier,
        supportsTablet: true,
      },
      android: {
        package: androidIdentifier,
      },
      extra: {
        cryzoWebUrl: webUrl,
      },
    },
  };

  const easJson = {
    cli: { version: ">= 16.0.0", appVersionSource: "remote" },
    build: {
      production: {
        distribution: "store",
        autoIncrement: true,
      },
    },
    submit: {
      production: {},
    },
  };

  const appSource = `import React from "react";\nimport { SafeAreaView, StyleSheet } from "react-native";\nimport { WebView } from "react-native-webview";\n\nconst WEB_URL = ${JSON.stringify(webUrl)};\n\nexport default function App() {\n  return (\n    <SafeAreaView style={styles.container}>\n      <WebView\n        source={{ uri: WEB_URL }}\n        style={styles.webview}\n        startInLoadingState\n        javaScriptEnabled\n        domStorageEnabled\n        allowsBackForwardNavigationGestures\n        sharedCookiesEnabled\n        thirdPartyCookiesEnabled\n        originWhitelist={["https://*", "http://*"]}\n      />\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, backgroundColor: "#000" },\n  webview: { flex: 1 },\n});\n`;

  return [
    { path: `${MOBILE_DIR}/package.json`, content: Buffer.from(JSON.stringify(packageJson, null, 2), "utf8") },
    { path: `${MOBILE_DIR}/app.json`, content: Buffer.from(JSON.stringify(appJson, null, 2), "utf8") },
    { path: `${MOBILE_DIR}/eas.json`, content: Buffer.from(JSON.stringify(easJson, null, 2), "utf8") },
    { path: `${MOBILE_DIR}/App.js`, content: Buffer.from(appSource, "utf8") },
  ];
}

async function prepareProject(
  sandbox: Sandbox,
  body: Required<Pick<MobileRequest, "expoToken" | "expoAccount" | "appName" | "identifier" | "webUrl" | "platform">>,
) {
  const slug = safeSlug(body.appName);
  const identifier = safeIdentifier(body.identifier, body.platform);
  const iosIdentifier = body.platform === "ios" ? identifier : identifier;
  const androidIdentifier = body.platform === "android" ? identifier : identifier;

  await sandbox.runCommand("mkdir", ["-p", MOBILE_DIR]);
  await sandbox.writeFiles(
    wrapperFiles({
      appName: body.appName,
      slug,
      webUrl: body.webUrl,
      iosIdentifier,
      androidIdentifier,
    }),
  );

  const env = { EXPO_TOKEN: body.expoToken };
  const install = await run(
    sandbox,
    "npm install --no-audit --no-fund",
    env,
  );
  const init = await run(
    sandbox,
    `npx --yes eas-cli@latest init --account ${JSON.stringify(body.expoAccount)} --json --non-interactive`,
    env,
  );

  let expoProjectId: string | undefined;
  try {
    const parsed = JSON.parse(init.output) as { id?: string; projectId?: string };
    expoProjectId = parsed.id || parsed.projectId;
  } catch {
    const match = init.output.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
    expoProjectId = match?.[0];
  }

  return { env, installOutput: install.output, initOutput: init.output, expoProjectId };
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

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MobileRequest;
    if (!body.conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }
    const authToken = await requireConversation(req, body.conversationId);

    if (body.operation === "check") {
      const issues: string[] = [];
      if (!body.webUrl || !/^https:\/\//i.test(body.webUrl)) {
        issues.push("Publish the web app to an HTTPS URL first.");
      }
      if (!body.appName?.trim()) issues.push("App name is required.");
      if (!body.identifier?.trim()) issues.push("Bundle/package identifier is required.");
      if (!body.expoToken?.trim()) issues.push("Connect an Expo access token.");
      if (!body.expoAccount?.trim()) issues.push("Expo account or organization is required.");
      if (!body.platform) issues.push("Choose iOS or Android.");

      let webReachable = false;
      if (body.webUrl && /^https:\/\//i.test(body.webUrl)) {
        try {
          const response = await fetch(body.webUrl, { method: "HEAD", redirect: "follow", cache: "no-store" });
          webReachable = response.ok;
          if (!response.ok) issues.push(`Published web app returned HTTP ${response.status}.`);
        } catch {
          issues.push("Published web app could not be reached.");
        }
      }

      return Response.json({
        success: issues.length === 0,
        ready: issues.length === 0,
        webReachable,
        issues,
      });
    }

    if (!body.expoToken?.trim()) {
      return Response.json({ error: "Missing Expo access token" }, { status: 400 });
    }

    const sandbox = await getSandbox(body.conversationId);
    const env = { EXPO_TOKEN: body.expoToken.trim() };

    if (body.operation === "status") {
      if (!body.buildId) return Response.json({ error: "Missing buildId" }, { status: 400 });
      const result = await run(
        sandbox,
        `npx --yes eas-cli@latest build:view ${JSON.stringify(body.buildId)} --json`,
        env,
      );
      const build = parseBuildJson(result.output) || {};
      return Response.json({
        success: true,
        buildId: body.buildId,
        status: build.status || "unknown",
        buildUrl: build.buildDetailsPageUrl,
        artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
        raw: result.output.slice(-12000),
      });
    }

    if (body.operation === "submit") {
      if (!body.platform || !body.buildId) {
        return Response.json({ error: "Missing platform or buildId" }, { status: 400 });
      }
      const result = await run(
        sandbox,
        `npx --yes eas-cli@latest submit --platform ${body.platform} --id ${JSON.stringify(body.buildId)} --profile production --non-interactive --no-wait`,
        env,
      );
      return Response.json({
        success: true,
        status: "submission-started",
        output: result.output.slice(-12000),
      });
    }

    if (body.operation !== "build") {
      return Response.json({ error: "Unknown mobile operation" }, { status: 400 });
    }

    if (!body.platform || !body.expoAccount?.trim() || !body.appName?.trim() || !body.identifier?.trim() || !body.webUrl?.trim()) {
      return Response.json({ error: "Missing mobile build configuration" }, { status: 400 });
    }
    if (!/^https:\/\//i.test(body.webUrl)) {
      return Response.json({ error: "Mobile wrappers require a published HTTPS web URL" }, { status: 400 });
    }

    const prepared = await prepareProject(sandbox, {
      expoToken: body.expoToken.trim(),
      expoAccount: body.expoAccount.trim(),
      appName: body.appName.trim(),
      identifier: body.identifier.trim(),
      webUrl: body.webUrl.trim(),
      platform: body.platform,
    });

    const buildResult = await run(
      sandbox,
      `npx --yes eas-cli@latest build --platform ${body.platform} --profile production --non-interactive --no-wait --json`,
      prepared.env,
    );
    const build = parseBuildJson(buildResult.output);
    if (!build?.id) {
      throw new Error(`EAS started but Cryzo could not read the build ID.\n${buildResult.output.slice(-6000)}`);
    }

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
        identifier: safeIdentifier(body.identifier, body.platform),
        webUrl: body.webUrl.trim(),
      },
      { token: authToken },
    );

    return Response.json({
      success: true,
      platform: body.platform,
      expoProjectId: prepared.expoProjectId,
      buildId: build.id,
      status: build.status || "queued",
      buildUrl: build.buildDetailsPageUrl,
      artifactUrl: build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
      output: [prepared.initOutput, buildResult.output].filter(Boolean).join("\n").slice(-12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mobile build failed";
    const status = message === "Unauthorized" ? 401 : message === "Conversation not found" ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
