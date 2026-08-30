import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PublishFile = { path: string; content: string };
type SupabaseEnv = { url?: string; publicKey?: string };
type PublishRequest = {
  conversationId: string;
  projectName: string;
  requestedSlug?: string;
  files: PublishFile[];
  supabase?: SupabaseEnv | null;
};

type DnsInstruction = {
  type: "CNAME" | "A" | "TXT";
  name: string;
  value: string;
  note?: string;
};

type DomainResult = {
  assigned: boolean;
  verified: boolean;
  misconfigured: boolean;
  sslReady: boolean;
  setupRequired: boolean;
  sslPending: boolean;
  dns?: DnsInstruction | null;
  error?: string;
  verification?: unknown;
};

type DomainConfig = {
  configuredBy?: string;
  acceptedChallenges?: string[];
  recommendedIPv4?: Array<string | { value?: string; rank?: number }>;
  recommendedCNAME?: Array<string | { value?: string; rank?: number }>;
  misconfigured?: boolean;
};

const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "auth", "billing", "blog", "chat",
  "dashboard", "docs", "help", "login", "mail", "status", "support",
]);

function sanitizeSlug(value: string, fallback = "cryzo-app") {
  const slug = value
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

function normalizeFiles(files: PublishFile[]) {
  return files
    .map((file) => ({ file: file.path.replace(/^\/+/, ""), data: file.content }))
    .filter((file) => file.file && !file.file.includes(".."));
}

function getBearerToken(req: Request) {
  const authorization = req.headers.get("authorization") || "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
}

async function readApiError(response: Response) {
  try {
    const data = (await response.json()) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    return data.error?.message || data.message || JSON.stringify(data);
  } catch {
    return await response.text().catch(() => "");
  }
}

function vercelUrl(path: string, teamId: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `https://api.vercel.com${path}${separator}teamId=${encodeURIComponent(teamId)}`;
}

async function vercelFetch(
  token: string,
  teamId: string,
  path: string,
  init: RequestInit = {},
) {
  return await fetch(vercelUrl(path, teamId), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
}

function recommendedValue(items?: Array<string | { value?: string; rank?: number }>) {
  if (!Array.isArray(items)) return undefined;
  const sorted = [...items].sort((a, b) => {
    const ar = typeof a === "string" ? 0 : a.rank || 0;
    const br = typeof b === "string" ? 0 : b.rank || 0;
    return ar - br;
  });
  for (const item of sorted) {
    const value = typeof item === "string" ? item : item.value;
    if (value) return value.replace(/\.$/, "");
  }
  return undefined;
}

function dnsInstructionFromConfig(config: DomainConfig, hostingDomain: string): DnsInstruction | null {
  const cname = recommendedValue(config.recommendedCNAME);
  if (cname) {
    return {
      type: "CNAME",
      name: "*",
      value: cname,
      note: `Add this once in Squarespace DNS for *.${hostingDomain}.`,
    };
  }
  const ipv4 = recommendedValue(config.recommendedIPv4);
  if (ipv4) {
    return {
      type: "A",
      name: "*",
      value: ipv4,
      note: `Add this once in Squarespace DNS for *.${hostingDomain}.`,
    };
  }
  return null;
}

async function getDomainConfig(
  token: string,
  teamId: string,
  hostname: string,
  projectIdOrName?: string,
) {
  const projectQuery = projectIdOrName
    ? `?projectIdOrName=${encodeURIComponent(projectIdOrName)}&strict=true`
    : "?strict=true";
  const response = await vercelFetch(
    token,
    teamId,
    `/v6/domains/${encodeURIComponent(hostname)}/config${projectQuery}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as DomainConfig;
}

async function ensureVercelProject({
  token,
  teamId,
  projectName,
  existingProjectId,
}: {
  token: string;
  teamId: string;
  projectName: string;
  existingProjectId?: string;
}) {
  if (existingProjectId) return { id: existingProjectId, name: projectName };

  const create = await vercelFetch(token, teamId, "/v10/projects", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      framework: "vite",
      buildCommand: "npm run build",
      installCommand: "npm install",
      outputDirectory: "dist",
    }),
  });

  if (create.ok) return (await create.json()) as { id: string; name: string };
  if (create.status !== 409) {
    throw new Error((await readApiError(create)) || "Failed to create Cryzo hosting project");
  }

  const existing = await vercelFetch(
    token,
    teamId,
    `/v9/projects/${encodeURIComponent(projectName)}`,
  );
  if (!existing.ok) {
    throw new Error((await readApiError(existing)) || "Failed to load Cryzo hosting project");
  }
  return (await existing.json()) as { id: string; name: string };
}

async function upsertProjectEnvironment({
  token,
  teamId,
  projectId,
  supabase,
}: {
  token: string;
  teamId: string;
  projectId: string;
  supabase?: SupabaseEnv | null;
}) {
  if (!supabase?.url || !supabase?.publicKey) return;

  const variables = [
    { key: "VITE_SUPABASE_URL", value: supabase.url },
    { key: "VITE_SUPABASE_ANON_KEY", value: supabase.publicKey },
    { key: "VITE_SUPABASE_PUBLISHABLE_KEY", value: supabase.publicKey },
  ].map((item) => ({
    ...item,
    type: "plain",
    target: ["production", "preview"],
  }));

  const response = await vercelFetch(
    token,
    teamId,
    `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
    { method: "POST", body: JSON.stringify(variables) },
  );
  if (!response.ok) {
    throw new Error(
      (await readApiError(response)) || "Failed to configure Supabase environment variables",
    );
  }
}

async function createDeployment({
  token,
  teamId,
  projectId,
  projectName,
  files,
}: {
  token: string;
  teamId: string;
  projectId: string;
  projectName: string;
  files: PublishFile[];
}) {
  const normalized = normalizeFiles(files);
  if (normalized.length === 0) throw new Error("No files to publish");

  const response = await vercelFetch(
    token,
    teamId,
    "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1",
    {
      method: "POST",
      body: JSON.stringify({
        name: projectName,
        project: projectId,
        target: "production",
        files: normalized,
        projectSettings: {
          framework: "vite",
          installCommand: "npm install",
          buildCommand: "npm run build",
          outputDirectory: "dist",
        },
        meta: { platform: "cryzo" },
      }),
    },
  );
  if (!response.ok) {
    throw new Error((await readApiError(response)) || `Vercel deployment failed (${response.status})`);
  }
  return (await response.json()) as {
    id: string;
    url?: string;
    readyState?: string;
    status?: string;
    alias?: string[];
  };
}

async function waitForDeployment(token: string, teamId: string, deploymentId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await vercelFetch(
      token,
      teamId,
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    );
    if (!response.ok) break;
    const deployment = (await response.json()) as {
      readyState?: string;
      status?: string;
      alias?: string[];
      url?: string;
      errorMessage?: string;
    };
    const state = deployment.readyState || deployment.status;
    if (state === "READY") return deployment;
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(deployment.errorMessage || `Cryzo hosting deployment ${state.toLowerCase()}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function getProjectDomain(
  token: string,
  teamId: string,
  projectId: string,
  hostname: string,
) {
  const response = await vercelFetch(
    token,
    teamId,
    `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as {
    name?: string;
    verified?: boolean;
    verification?: unknown;
  };
}

async function httpsIsReady(hostname: string) {
  try {
    const response = await fetch(`https://${hostname}/`, {
      method: "HEAD",
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForHttps(hostname: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    if (await httpsIsReady(hostname)) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureCryzoSubdomain({
  token,
  teamId,
  projectId,
  hostname,
  hostingDomain,
}: {
  token: string;
  teamId: string;
  projectId: string;
  hostname: string;
  hostingDomain: string;
}): Promise<DomainResult> {
  let domain = await getProjectDomain(token, teamId, projectId, hostname);

  if (!domain) {
    const addDomain = await vercelFetch(
      token,
      teamId,
      `/v10/projects/${encodeURIComponent(projectId)}/domains`,
      { method: "POST", body: JSON.stringify({ name: hostname }) },
    );
    if (!addDomain.ok && addDomain.status !== 409 && addDomain.status !== 400) {
      return {
        assigned: false,
        verified: false,
        misconfigured: true,
        sslReady: false,
        setupRequired: false,
        sslPending: false,
        error: (await readApiError(addDomain)) || "Unable to attach Cryzo subdomain",
      };
    }
    domain = addDomain.ok
      ? ((await addDomain.json()) as { name?: string; verified?: boolean; verification?: unknown })
      : await getProjectDomain(token, teamId, projectId, hostname);
  }

  if (domain && !domain.verified) {
    const verify = await vercelFetch(
      token,
      teamId,
      `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`,
      { method: "POST" },
    );
    if (verify.ok) {
      domain = (await verify.json()) as {
        name?: string;
        verified?: boolean;
        verification?: unknown;
      };
    }
  }

  const config = await getDomainConfig(token, teamId, hostname, projectId);
  if (!config) {
    return {
      assigned: false,
      verified: Boolean(domain?.verified),
      misconfigured: true,
      sslReady: false,
      setupRequired: false,
      sslPending: false,
      verification: domain?.verification,
      error: "Vercel could not inspect the Cryzo subdomain configuration yet. Try again shortly.",
    };
  }

  const misconfigured = Boolean(config.misconfigured);
  const verified = Boolean(domain?.verified);
  const dns = dnsInstructionFromConfig(config, hostingDomain);

  if (!verified) {
    return {
      assigned: false,
      verified: false,
      misconfigured,
      sslReady: false,
      setupRequired: true,
      sslPending: false,
      dns,
      verification: domain?.verification,
      error: "Cryzo owns the deployment, but Vercel still needs domain verification before it can serve this subdomain.",
    };
  }

  if (misconfigured) {
    return {
      assigned: false,
      verified: true,
      misconfigured: true,
      sslReady: false,
      setupRequired: true,
      sslPending: false,
      dns,
      verification: domain?.verification,
      error: "One-time Squarespace DNS setup is required for Cryzo Hosting. Add the wildcard record shown, wait for DNS propagation, then publish again.",
    };
  }

  const sslReady = await waitForHttps(hostname);
  if (!sslReady) {
    return {
      assigned: false,
      verified: true,
      misconfigured: false,
      sslReady: false,
      setupRequired: false,
      sslPending: true,
      dns: null,
      verification: domain?.verification,
      error: "DNS is configured. Vercel is provisioning SSL for this Cryzo URL; publish again in about a minute.",
    };
  }

  return {
    assigned: true,
    verified: true,
    misconfigured: false,
    sslReady: true,
    setupRequired: false,
    sslPending: false,
    dns: null,
    verification: domain?.verification,
  };
}

async function requireConversation(req: Request, conversationId: string) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");
  const conversation = await fetchQuery(
    api.conversations.get,
    { id: conversationId as Id<"conversations"> },
    { token },
  );
  if (!conversation) throw new Error("Conversation not found");
  return { token, conversation };
}

async function chooseSlug({
  token,
  conversationId,
  requestedSlug,
  fallback,
}: {
  token: string;
  conversationId: string;
  requestedSlug?: string;
  fallback: string;
}) {
  const requested = sanitizeSlug(requestedSlug || fallback);
  if (RESERVED_SLUGS.has(requested)) {
    throw new Error("That Cryzo URL is reserved. Pick another name.");
  }
  const availability = await fetchQuery(
    api.hosting.findCryzoSlug,
    { conversationId: conversationId as Id<"conversations">, slug: requested },
    { token },
  );
  if (availability.available) return requested;
  if (requestedSlug) throw new Error("That Cryzo URL is already taken");
  return `${requested.slice(0, 39)}-${conversationId.slice(-7).toLowerCase()}`;
}

function getPlatformConfig() {
  const platformToken =
    process.env.CRYZO_VERCEL_TOKEN ||
    process.env.VERCEL_PLATFORM_TOKEN ||
    process.env.VERCEL_TOKEN;
  const teamId =
    process.env.CRYZO_VERCEL_TEAM_ID ||
    process.env.VERCEL_TEAM_ID ||
    "team_ZityBkke0oJwGHtvANucmg3m";
  const hostingDomain = (process.env.CRYZO_HOSTING_DOMAIN || "cryzo.me")
    .replace(/^https?:\/\//, "")
    .replace(/^\*\./, "")
    .replace(/\/$/, "");
  return { platformToken, teamId, hostingDomain };
}

export async function GET(req: Request) {
  try {
    const conversationId = new URL(req.url).searchParams.get("conversationId") || "";
    if (!conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 });
    const { token } = await requireConversation(req, conversationId);
    const target = await fetchQuery(
      api.hosting.getCryzoTarget,
      { conversationId: conversationId as Id<"conversations"> },
      { token },
    );
    const { platformToken, teamId, hostingDomain } = getPlatformConfig();

    let hostingHealth: Record<string, unknown> | null = null;
    if (platformToken) {
      const hostname = target?.slug
        ? `${target.slug}.${hostingDomain}`
        : `cryzo-hosting-probe.${hostingDomain}`;
      const projectIdOrName = target?.targetId || process.env.CRYZO_VERCEL_ROOT_PROJECT_ID || "cryzo-v11";
      const config = await getDomainConfig(platformToken, teamId, hostname, projectIdOrName);
      hostingHealth = config
        ? {
            dnsReady: !config.misconfigured,
            misconfigured: Boolean(config.misconfigured),
            configuredBy: config.configuredBy || null,
            dns: dnsInstructionFromConfig(config, hostingDomain),
          }
        : { dnsReady: false, misconfigured: true, dns: null };
    }

    return Response.json({
      target,
      configured: Boolean(platformToken),
      hostingDomain,
      desiredUrl: target?.slug ? `https://${target.slug}.${hostingDomain}` : null,
      hostingHealth,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load hosting status";
    return Response.json({ error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as PublishRequest;
    if (!body.conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 });
    if (!Array.isArray(body.files) || body.files.length === 0) {
      return Response.json({ error: "No files to publish" }, { status: 400 });
    }

    const { token: authToken } = await requireConversation(req, body.conversationId);
    const { platformToken, teamId, hostingDomain } = getPlatformConfig();
    if (!platformToken) {
      return Response.json(
        {
          error: "Cryzo Hosting needs CRYZO_VERCEL_TOKEN on the Cryzo server.",
          code: "CRYZO_HOSTING_NOT_CONFIGURED",
        },
        { status: 503 },
      );
    }

    const existing = await fetchQuery(
      api.hosting.getCryzoTarget,
      { conversationId: body.conversationId as Id<"conversations"> },
      { token: authToken },
    );
    const slug = await chooseSlug({
      token: authToken,
      conversationId: body.conversationId,
      requestedSlug: body.requestedSlug,
      fallback: existing?.slug || body.projectName,
    });
    const projectName = existing?.targetId
      ? `cryzo-${slug}-${body.conversationId.slice(-6).toLowerCase()}`
      : sanitizeSlug(`cryzo-${slug}-${body.conversationId.slice(-6)}`);

    const project = await ensureVercelProject({
      token: platformToken,
      teamId,
      projectName,
      existingProjectId: existing?.targetId,
    });

    await upsertProjectEnvironment({
      token: platformToken,
      teamId,
      projectId: project.id,
      supabase: body.supabase,
    });

    const deployment = await createDeployment({
      token: platformToken,
      teamId,
      projectId: project.id,
      projectName: project.name || projectName,
      files: body.files,
    });
    const ready = await waitForDeployment(platformToken, teamId, deployment.id);

    const desiredHostname = `${slug}.${hostingDomain}`;
    const domain = await ensureCryzoSubdomain({
      token: platformToken,
      teamId,
      projectId: project.id,
      hostname: desiredHostname,
      hostingDomain,
    });

    const aliasList = ready?.alias || deployment.alias || [];
    const defaultVercelAlias = aliasList.find((alias) => alias.endsWith(".vercel.app"));
    const fallbackUrl = defaultVercelAlias
      ? `https://${defaultVercelAlias}`
      : deployment.url
        ? `https://${deployment.url}`
        : `https://${project.name || projectName}.vercel.app`;
    const cryzoUrl = `https://${desiredHostname}`;
    const canonicalUrl = domain.assigned ? cryzoUrl : fallbackUrl;

    await fetchMutation(
      api.hosting.upsertCryzoTarget,
      {
        conversationId: body.conversationId as Id<"conversations">,
        targetId: project.id,
        slug,
        url: canonicalUrl,
        deploymentId: deployment.id,
        customDomain: domain.assigned ? desiredHostname : undefined,
      },
      { token: authToken },
    );

    return Response.json({
      success: true,
      projectId: project.id,
      deploymentId: deployment.id,
      slug,
      url: canonicalUrl,
      desiredUrl: cryzoUrl,
      fallbackUrl,
      subdomainAssigned: domain.assigned,
      domainVerified: domain.verified,
      domainMisconfigured: domain.misconfigured,
      domainSslReady: domain.sslReady,
      domainSetupRequired: domain.setupRequired,
      domainSslPending: domain.sslPending,
      domainError: domain.error,
      domainVerification: domain.verification,
      dns: domain.dns || null,
      state: ready?.readyState || ready?.status || deployment.readyState || deployment.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cryzo hosting publish failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
