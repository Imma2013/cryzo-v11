import { Sandbox } from "@vercel/sandbox";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEGACY_MOBILE_DIR = "/vercel/sandbox/mobile-wrapper";
const SOURCE_PROJECT_DIR = "/vercel/sandbox/project";
const MOBILE_TIMEOUT_MS = 45 * 60 * 1000;
const SOURCE_PREVIEW_PORT = 5173;

type Platform = "ios" | "android";
type SourceType = "expo-native" | "expo-webview";
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
  operation: "check" | "build" | "status" | "submit";
  conversationId: string;
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
  const safe = conversationId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 42);
  return `cryzo-mobile-${safe}`;
}

function sourceSandboxNameFor(conversationId: string) {
  const safe = conversationId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .slice(0, 48);
  return `cryzo-${safe}`;
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
    ports: [SOURCE_PREVIEW_PORT],
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

function baseEasJson() {
  return {
    cli: { version: ">= 16.0.0", appVersionSource: "remote" },
    build: {
      production: {
        distribution: "store",
        autoIncrement: true,
      },
      development: {
        developmentClient: true,
        distribution: "internal",
      },
    },
    submit: {
      production: {},
    },
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
      ios: {
        bundleIdentifier: identifier,
        supportsTablet: true,
      },
      android: {
        package: identifier,
      },
      extra: {
        cryzoWebUrl: webUrl,
      },
    },
  };

  const appSource = `import React from "react";\nimport { SafeAreaView, StyleSheet } from "react-native";\nimport { WebView } from "react-native-webview";\n\nconst WEB_URL = ${JSON.stringify(webUrl)};\n\nexport default function App() {\n  return (\n    <SafeAreaView style={styles.container}>\n      <WebView\n        source={{ uri: WEB_URL }}\n        style={styles.webview}\n        startInLoadingState\n        javaScriptEnabled\n        domStorageEnabled\n        allowsBackForwardNavigationGestures\n        sharedCookiesEnabled\n        thirdPartyCookiesEnabled\n        originWhitelist={["https://*", "http://*"]}\n      />\n    </SafeAreaView>\n  );\n}\n\nconst styles = StyleSheet.create({\n  container: { flex: 1, backgroundColor: "#000" },\n  webview: { flex: 1 },\n});\n`;

  return [
    {
      path: `${LEGACY_MOBILE_DIR}/package.json`,
      content: Buffer.from(JSON.stringify(packageJson, null, 2), "utf8"),
    },
    {
      path: `${LEGACY_MOBILE_DIR}/app.json`,
      content: Buffer.from(JSON.stringify(appJson, null, 2), "utf8"),
    },
    {
      path: `${LEGACY_MOBILE_DIR}/eas.json`,
      content: Buffer.from(JSON.stringify(baseEasJson(), null, 2), "utf8"),
    },
    {
      path: `${LEGACY_MOBILE_DIR}/App.js`,
      content: Buffer.from(appSource, "utf8"),
    },
  ];
}

async function readJsonFile(
  workspace: Workspace,
  fileName: string,
): Promise<Record<string, any> | null> {
  const buffer = await workspace.sandbox.readFileToBuffer({
    path: `${workspace.cwd}/${fileName}`,
  });
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

async function configureNativeExpoProject(
  workspace: Workspace,
  appName: string,
  identifierValue: string,
) {
  const packageJson = await readJsonFile(workspace, "package.json");
  if (!packageJson) {
    throw new Error("Generate the mobile app before building it for a store");
  }
  const dependencies = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };
  if (!dependencies.expo || !dependencies["react-native"]) {
    throw new Error(
      "This mobile project is missing Expo or React Native. Ask Cryzo to regenerate it as a native mobile app first",
    );
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
      ios: {
        ...(expo.ios || {}),
        bundleIdentifier: identifier,
      },
      android: {
        ...(expo.android || {}),
        package: identifier,
      },
    },
  };

  await workspace.sandbox.writeFiles([
    {
      path: `${workspace.cwd}/app.json`,
      content: Buffer.from(JSON.stringify(appJson, null, 2), "utf8"),
    },
    {
      path: `${workspace.cwd}/eas.json`,
      content: Buffer.from(JSON.stringify(baseEasJson(), null, 2), "utf8"),
    },
  ]);
}

async function prepareProject(
  workspace: Workspace,
  body: Required<
    Pick<
      MobileRequest,
      "expoToken" | "expoAccount" | "appName" | "identifier" | "platform"
    >
  > & { webUrl?: string },
) {
  const slug = safeSlug(body.appName);
  const identifier = safeIdentifier(body.identifier);

  if (workspace.sourceType === "expo-native") {
    await configureNativeExpoProject(workspace, body.appName, identifier);
  } else {
    if (!body.webUrl || !/^https:\/\//i.test(body.webUrl)) {
      throw new Error("Legacy mobile wrappers require a published HTTPS web URL");
    }
    await run(
      workspace,
      `rm -rf ${JSON.stringify(LEGACY_MOBILE_DIR)} && mkdir -p ${JSON.stringify(
        LEGACY_MOBILE_DIR,
      )}`,
      undefined,
      true,
    );
    await workspace.sandbox.writeFiles(
      legacyWrapperFiles({
        appName: body.appName,
        slug,
        webUrl: body.webUrl,
        identifier,
      }),
    );
  }

  const env = { EXPO_TOKEN: body.expoToken };
  const install = await run(
    workspace,
    "npm install --no-audit --no-fund",
    env,
  );
  const init = await run(
    workspace,
    `npx --yes eas-cli@latest init --account ${JSON.stringify(
      body.expoAccount,
    )} --json --non-interactive`,
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

  return {
    env,
    installOutput: install.output,
    initOutput: init.output,
    expoProjectId,
    sourceType: workspace.sourceType,
  };
}

function parseBuildJson(output: string) {
  const trimmed = output.trim();
  const start = trimmed.indexOf("[");
  const objectStart = trimmed.indexOf("{");
  const jsonStart =
    start >= 0 && (objectStart < 0 || start < objectStart) ? start : objectStart;
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

async function configureSubmitCredentials(
  workspace: Workspace,
  body: MobileRequest,
) {
  const credentialDir = `${workspace.cwd}/.cryzo-credentials`;
  await run(
    workspace,
    `rm -rf ${JSON.stringify(credentialDir)} && mkdir -p ${JSON.stringify(
      credentialDir,
    )}`,
  );

  if (body.platform === "ios") {
    const credentials = body.iosSubmit;
    if (
      !credentials?.keyContent?.trim() ||
      !credentials.keyId?.trim() ||
      !credentials.issuerId?.trim() ||
      !credentials.ascAppId?.trim()
    ) {
      throw new Error(
        "iOS submission requires the App Store Connect .p8 key, Key ID, Issuer ID, and App Store Connect App ID",
      );
    }
    const keyFileName = `AuthKey_${credentials.keyId.trim()}.p8`;
    await workspace.sandbox.writeFiles([
      {
        path: `${credentialDir}/${keyFileName}`,
        content: Buffer.from(credentials.keyContent.trim() + "\n", "utf8"),
      },
    ]);
    const easJson = baseEasJson();
    (easJson.submit.production as any) = {
      ios: {
        ascApiKeyPath: `.cryzo-credentials/${keyFileName}`,
        ascApiKeyIssuerId: credentials.issuerId.trim(),
        ascApiKeyId: credentials.keyId.trim(),
        ascAppId: credentials.ascAppId.trim(),
        ...(credentials.appleTeamId?.trim()
          ? { appleTeamId: credentials.appleTeamId.trim() }
          : {}),
      },
    };
    await workspace.sandbox.writeFiles([
      {
        path: `${workspace.cwd}/eas.json`,
        content: Buffer.from(JSON.stringify(easJson, null, 2), "utf8"),
      },
    ]);
    return;
  }

  if (body.platform === "android") {
    const credentials = body.androidSubmit;
    if (!credentials?.serviceAccountJson?.trim()) {
      throw new Error(
        "Android submission requires a Google Play service-account JSON key",
      );
    }
    try {
      JSON.parse(credentials.serviceAccountJson);
    } catch {
      throw new Error("The Google Play service-account file is not valid JSON");
    }
    await workspace.sandbox.writeFiles([
      {
        path: `${credentialDir}/google-service-account.json`,
        content: Buffer.from(
          credentials.serviceAccountJson.trim() + "\n",
          "utf8",
        ),
      },
    ]);
    const easJson = baseEasJson();
    (easJson.submit.production as any) = {
      android: {
        serviceAccountKeyPath: ".cryzo-credentials/google-service-account.json",
        track: credentials.track || "internal",
        releaseStatus: "draft",
      },
    };
    await workspace.sandbox.writeFiles([
      {
        path: `${workspace.cwd}/eas.json`,
        content: Buffer.from(JSON.stringify(easJson, null, 2), "utf8"),
      },
    ]);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as MobileRequest;
    if (!body.conversationId) {
      return Response.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const { token: authToken, conversation } = await requireConversation(
      req,
      body.conversationId,
    );
    const nativeTarget = isNativeConversation(conversation);
    const workspace = await workspaceFor(body.conversationId, nativeTarget);

    if (body.operation === "check") {
      const issues: string[] = [];
      const nativeSourceReady = nativeTarget
        ? await hasNativeExpoSource(workspace)
        : false;

      if (nativeTarget && !nativeSourceReady) {
        issues.push(
          "Build the mobile project in Cryzo first so its Expo source is available.",
        );
      }
      if (!nativeTarget && (!body.webUrl || !/^https:\/\//i.test(body.webUrl))) {
        issues.push("Publish the web app to an HTTPS URL first.");
      }
      if (!body.appName?.trim()) issues.push("App name is required.");
      if (!body.identifier?.trim()) {
        issues.push("Bundle/package identifier is required.");
      }
      if (!body.expoToken?.trim()) issues.push("Connect an Expo access token.");
      if (!body.expoAccount?.trim()) {
        issues.push("Expo account or organization is required.");
      }
      if (!body.platform) issues.push("Choose iOS or Android.");

      let webReachable = false;
      if (!nativeTarget && body.webUrl && /^https:\/\//i.test(body.webUrl)) {
        try {
          let response = await fetch(body.webUrl, {
            method: "HEAD",
            redirect: "follow",
            cache: "no-store",
          });
          if (response.status === 405) {
            response = await fetch(body.webUrl, {
              method: "GET",
              redirect: "follow",
              cache: "no-store",
            });
          }
          webReachable = response.ok;
          if (!response.ok) {
            issues.push(`Published web app returned HTTP ${response.status}.`);
          }
        } catch {
          issues.push("Published web app could not be reached.");
        }
      }

      return Response.json({
        success: issues.length === 0,
        ready: issues.length === 0,
        webReachable: nativeTarget ? null : webReachable,
        sourceType: workspace.sourceType,
        wrapperType: workspace.sourceType,
        nativeSourceReady,
        issues,
      });
    }

    if (!body.expoToken?.trim()) {
      return Response.json({ error: "Missing Expo access token" }, { status: 400 });
    }

    const env = { EXPO_TOKEN: body.expoToken.trim() };

    if (body.operation === "status") {
      if (!body.buildId) {
        return Response.json({ error: "Missing buildId" }, { status: 400 });
      }
      const result = await run(
        workspace,
        `npx --yes eas-cli@latest build:view ${JSON.stringify(body.buildId)} --json`,
        env,
      );
      const build = parseBuildJson(result.output) || {};
      return Response.json({
        success: true,
        sourceType: workspace.sourceType,
        buildId: body.buildId,
        status: build.status || "unknown",
        buildUrl: build.buildDetailsPageUrl,
        artifactUrl:
          build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
        raw: result.output.slice(-12000),
      });
    }

    if (body.operation === "submit") {
      if (!body.platform || !body.buildId) {
        return Response.json(
          { error: "Missing platform or buildId" },
          { status: 400 },
        );
      }
      try {
        await configureSubmitCredentials(workspace, body);
        const result = await run(
          workspace,
          `npx --yes eas-cli@latest submit --platform ${body.platform} --id ${JSON.stringify(
            body.buildId,
          )} --profile production --non-interactive --no-wait`,
          env,
        );
        return Response.json({
          success: true,
          sourceType: workspace.sourceType,
          status: "submission-started",
          output: result.output.slice(-12000),
        });
      } finally {
        await run(
          workspace,
          `rm -rf ${JSON.stringify(`${workspace.cwd}/.cryzo-credentials`)}`,
          env,
          true,
        );
      }
    }

    if (body.operation !== "build") {
      return Response.json({ error: "Unknown mobile operation" }, { status: 400 });
    }

    if (
      !body.platform ||
      !body.expoAccount?.trim() ||
      !body.appName?.trim() ||
      !body.identifier?.trim()
    ) {
      return Response.json(
        { error: "Missing mobile build configuration" },
        { status: 400 },
      );
    }
    if (!nativeTarget && (!body.webUrl || !/^https:\/\//i.test(body.webUrl))) {
      return Response.json(
        { error: "Legacy mobile wrappers require a published HTTPS web URL" },
        { status: 400 },
      );
    }

    const prepared = await prepareProject(workspace, {
      expoToken: body.expoToken.trim(),
      expoAccount: body.expoAccount.trim(),
      appName: body.appName.trim(),
      identifier: body.identifier.trim(),
      webUrl: body.webUrl?.trim(),
      platform: body.platform,
    });

    const buildResult = await run(
      workspace,
      `npx --yes eas-cli@latest build --platform ${body.platform} --profile production --non-interactive --no-wait --json`,
      prepared.env,
    );
    const build = parseBuildJson(buildResult.output);
    if (!build?.id) {
      throw new Error(
        `EAS started but Cryzo could not read the build ID.\n${buildResult.output.slice(
          -6000,
        )}`,
      );
    }

    await fetchMutation(
      (api as any).mobileBuilds.upsert,
      {
        conversationId: body.conversationId as Id<"conversations">,
        platform: body.platform,
        expoProjectId: prepared.expoProjectId,
        buildId: build.id,
        buildUrl: build.buildDetailsPageUrl,
        artifactUrl:
          build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
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
      artifactUrl:
        build.artifacts?.buildUrl || build.artifacts?.applicationArchiveUrl,
      output: [prepared.initOutput, buildResult.output]
        .filter(Boolean)
        .join("\n")
        .slice(-12000),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mobile build failed";
    const status =
      message === "Unauthorized"
        ? 401
        : message === "Conversation not found"
          ? 404
          : /requires|invalid|missing|generate|legacy/i.test(message)
            ? 400
            : 500;
    return Response.json({ error: message }, { status });
  }
}
