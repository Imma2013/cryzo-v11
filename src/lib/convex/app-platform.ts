import { Sandbox } from "@vercel/sandbox";
import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

type PublishFile = { path: string; content: string };

type BackendRecord = {
  projectId: number;
  projectName: string;
  deploymentName: string;
  deploymentUrl: string;
};

type CreateProjectResponse = {
  projectId: number;
  deploymentName?: string | null;
  deploymentUrl?: string | null;
};

const CONVEX_SANDBOX_DIR = "/vercel/sandbox/convex-app";

function safeProjectName(value: string, conversationId: string) {
  const base = value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38) || "cryzo-app";
  return `${base}-${conversationId.slice(-6).toLowerCase()}`;
}

function hasConvexBackend(files: PublishFile[]) {
  if (files.some((file) => file.path.replace(/^\/+/, "").startsWith("convex/"))) return true;
  const packageJson = files.find((file) => file.path.replace(/^\/+/, "") === "package.json");
  if (!packageJson) return false;
  try {
    const pkg = JSON.parse(packageJson.content) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.convex || pkg.devDependencies?.convex);
  } catch {
    return false;
  }
}

async function managementFetch(path: string, init: RequestInit = {}) {
  const token = process.env.CRYZO_CONVEX_TEAM_TOKEN;
  if (!token) throw new Error("CRYZO_CONVEX_TEAM_TOKEN is not configured");
  const response = await fetch(`https://api.convex.dev/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Convex platform API failed (${response.status})${detail ? `: ${detail.slice(0, 1000)}` : ""}`);
  }
  return response;
}

async function createProject(projectName: string): Promise<CreateProjectResponse> {
  const teamId = process.env.CRYZO_CONVEX_TEAM_ID;
  if (!teamId) throw new Error("CRYZO_CONVEX_TEAM_ID is not configured");
  const response = await managementFetch(`/teams/${encodeURIComponent(teamId)}/create_project`, {
    method: "POST",
    body: JSON.stringify({
      projectName,
      deploymentType: "prod",
      deploymentRegion: process.env.CRYZO_CONVEX_REGION || "aws-us-east-1",
    }),
  });
  return (await response.json()) as CreateProjectResponse;
}

async function createDeployKey(deploymentName: string) {
  const response = await managementFetch(
    `/deployments/${encodeURIComponent(deploymentName)}/create_deploy_key`,
    {
      method: "POST",
      body: JSON.stringify({ name: `Cryzo deploy ${new Date().toISOString()}` }),
    },
  );
  const data = (await response.json()) as { deployKey?: string };
  if (!data.deployKey) throw new Error("Convex did not return a deploy key");
  return data.deployKey;
}

async function deployGeneratedConvex(files: PublishFile[], deployKey: string, conversationId: string) {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    timeout: 15 * 60 * 1000,
    networkPolicy: "allow-all",
  });
  try {
    await sandbox.runCommand("mkdir", ["-p", CONVEX_SANDBOX_DIR]);
    const safeFiles = files
      .filter((file) => file.path && !file.path.includes(".."))
      .filter((file) => !file.path.startsWith("node_modules/") && !file.path.startsWith(".git/"))
      .map((file) => ({
        path: `${CONVEX_SANDBOX_DIR}/${file.path.replace(/^\/+/, "")}`,
        content: Buffer.from(file.content, "utf8"),
      }));
    await sandbox.writeFiles(safeFiles);

    const install = await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", "npm install --no-audit --no-fund"],
      cwd: CONVEX_SANDBOX_DIR,
      env: { CONVEX_DEPLOY_KEY: deployKey },
    });
    if (install.exitCode !== 0) {
      throw new Error((await install.stderr()) || (await install.stdout()) || "npm install failed while preparing Convex backend");
    }

    const deploy = await sandbox.runCommand({
      cmd: "sh",
      args: ["-lc", `npx convex deploy --message ${JSON.stringify(`Cryzo publish ${conversationId}`)}`],
      cwd: CONVEX_SANDBOX_DIR,
      env: { CONVEX_DEPLOY_KEY: deployKey },
    });
    if (deploy.exitCode !== 0) {
      throw new Error((await deploy.stderr()) || (await deploy.stdout()) || "Convex backend deploy failed");
    }
  } finally {
    await sandbox.stop().catch(() => {});
  }
}

export async function ensureAppConvexBackend({
  conversationId,
  projectName,
  files,
  authToken,
}: {
  conversationId: string;
  projectName: string;
  files: PublishFile[];
  authToken: string;
}): Promise<BackendRecord | null> {
  if (!hasConvexBackend(files)) return null;
  if (!process.env.CRYZO_CONVEX_TEAM_TOKEN || !process.env.CRYZO_CONVEX_TEAM_ID) {
    throw new Error("Managed Convex is not configured. Set CRYZO_CONVEX_TEAM_TOKEN and CRYZO_CONVEX_TEAM_ID.");
  }

  let backend = (await fetchQuery(
    (api as any).appBackends.getByConversation,
    { conversationId: conversationId as Id<"conversations"> },
    { token: authToken },
  )) as BackendRecord | null;

  if (!backend) {
    const projectNameForBackend = safeProjectName(projectName, conversationId);
    const created = await createProject(projectNameForBackend);
    if (!created.deploymentName || !created.deploymentUrl) {
      throw new Error("Convex project was created without a production deployment");
    }
    backend = {
      projectId: created.projectId,
      projectName: projectNameForBackend,
      deploymentName: created.deploymentName,
      deploymentUrl: created.deploymentUrl,
    };
    await fetchMutation(
      (api as any).appBackends.upsert,
      {
        conversationId: conversationId as Id<"conversations">,
        provider: "convex",
        ...backend,
      },
      { token: authToken },
    );
  }

  const deployKey = await createDeployKey(backend.deploymentName);
  await deployGeneratedConvex(files, deployKey, conversationId);
  return backend;
}
