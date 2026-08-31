import { fetchMutation, fetchQuery } from "convex/nextjs";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import {
  canRemoveManagedBranding,
  canUseExternalCustomDomains,
  entitlementSnapshot,
} from "@/lib/billing/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type PublishFile = { path: string; content: string };
type SupabaseEnv = { url?: string; publicKey?: string };
type PublishRequest = {
  conversationId: string;
  projectName: string;
  requestedSlug?: string;
  customDomain?: string;
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

type ProjectDomain = {
  name?: string;
  verified?: boolean;
  verification?: unknown;
};

const RESERVED_SLUGS = new Set([
  "www", "api", "app", "admin", "auth", "billing", "blog", "chat",
  "dashboard", "docs", "help", "login", "mail", "status", "support",
]);
const MANAGED_BRANDING_MARKER = "data-cryzo-managed-branding";

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

function sanitizeHostname(value?: string) {
  if (!value?.trim()) return "";
  const hostname = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^\.+|\.+$/g, "");
  if (
    hostname.length > 253 ||
    !hostname.includes(".") ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    hostname.split(".").some((label) => !label || label.length > 63 || label.startsWith("-") || label.endsWith("-"))
  ) {
    throw new Error("Enter a valid custom domain such as example.com");
  }
  return hostname;
}

function withManagedCryzoBranding(files: PublishFile[]) {
  const index = files.findIndex((file) => file.path.replace(/^\/+/, "") === "index.html");
  if (index < 0) return files;
  if (files[index].content.includes(MANAGED_BRANDING_MARKER)) return files;
  const badge = `\n<a ${MANAGED_BRANDING_MARKER} href="https://cryzo.me" target="_blank" rel="noreferrer" aria-label="Built with Cryzo" style="position:fixed!important;right:14px!important;bottom:14px!important;z-index:2147483647!important;display:inline-flex!important;align-items:center!important;gap:6px!important;padding:8px 11px!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:999px!important;background:rgba(18,18,20,.90)!important;color:#fff!important;font:600 12px/1.1 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif!important;text-decoration:none!important;box-shadow:0 8px 28px rgba(0,0,0,.28)!important;backdrop-filter:blur(12px)!important;-webkit-backdrop-filter:blur(12px)!important"><span aria-hidden="true" style="display:inline-block!important;width:7px!important;height:7px!important;border-radius:999px!important;background:#fff!important"></span>Built with Cryzo</a>`;
  const next = files.map((file) => ({ ...file }));
  const html = next[index].content;
  next[index].content = /<\/body>/i.test(html)
    ? html.replace(/<\/body>/i, `${badge}\n</body>`)
    : `${html}\n${badge}\n`;
  return next;
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

async function vercelFetch(token: string, teamId: string, path: string, init: RequestInit = {}) {
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
  if (cname) return { type: "CNAME", name: "*", value: cname, note: `Add this once in DNS for *.${hostingDomain}.` };
  const ipv4 = recommendedValue(config.recommendedIPv4);
  if (ipv4) return { type: "A", name: "*", value: ipv4, note: `Add this once in DNS for *.${hostingDomain}.` };
  return null;
}

function verificationInstruction(verification: unknown): DnsInstruction | null {
  if (!Array.isArray(verification) || verification.length === 0) return null;
  const first = verification[0] as { type?: string; domain?: string; value?: string };
  if (!first?.value) return null;
  const type = first.type === "A" || first.type === "CNAME" ? first.type : "TXT";
  return {
    type,
    name: first.domain || "@",
    value: first.value,
    note: "Add this verification record at your domain registrar, then publish again to re-check it.",
  };
}

function customDnsInstruction(config: DomainConfig, hostname: string): DnsInstruction | null {
  const labels = hostname.split(".");
  const isLikelyApex = labels.length === 2;
  const cname = recommendedValue(config.recommendedCNAME);
  const ipv4 = recommendedValue(config.recommendedIPv4);
  if (!isLikelyApex && cname) {
    return {
      type: "CNAME",
      name: labels.slice(0, -2).join(".") || labels[0],
      value: cname,
      note: `Point ${hostname} to Vercel at your registrar.`,
    };
  }
  if (ipv4) {
    return { type: "A", name: "@", value: ipv4, note: `Point ${hostname} to Vercel at your registrar.` };
  }
  if (cname) {
    return { type: "CNAME", name: "@", value: cname, note: `Point ${hostname} to Vercel at your registrar.` };
  }
  return null;
}

async function getDomainConfig(token: string, teamId: string, hostname: string, projectIdOrName?: string) {
  const projectQuery = projectIdOrName
    ? `?projectIdOrName=${encodeURIComponent(projectIdOrName)}&strict=true`
    : "?strict=true";
  const response = await vercelFetch(token, teamId, `/v6/domains/${encodeURIComponent(hostname)}/config${projectQuery}`);
  if (!response.ok) return null;
  return (await response.json()) as DomainConfig;
}

async function ensureVercelProject({ token, teamId, projectName, existingProjectId }: { token: string; teamId: string; projectName: string; existingProjectId?: string }) {
  if (existingProjectId) return { id: existingProjectId, name: projectName };
  const create = await vercelFetch(token, teamId, "/v10/projects", {
    method: "POST",
    body: JSON.stringify({ name: projectName, framework: "vite", buildCommand: "npm run build", installCommand: "npm install", outputDirectory: "dist" }),
  });
  if (create.ok) return (await create.json()) as { id: string; name: string };
  if (create.status !== 409) throw new Error((await readApiError(create)) || "Failed to create Cryzo hosting project");
  const existing = await vercelFetch(token, teamId, `/v9/projects/${encodeURIComponent(projectName)}`);
  if (!existing.ok) throw new Error((await readApiError(existing)) || "Failed to load Cryzo hosting project");
  return (await existing.json()) as { id: string; name: string };
}

async function upsertProjectEnvironment({ token, teamId, projectId, supabase }: { token: string; teamId: string; projectId: string; supabase?: SupabaseEnv | null }) {
  if (!supabase?.url || !supabase?.publicKey) return;
  const variables = [
    { key: "VITE_SUPABASE_URL", value: supabase.url },
    { key: "VITE_SUPABASE_ANON_KEY", value: supabase.publicKey },
    { key: "VITE_SUPABASE_PUBLISHABLE_KEY", value: supabase.publicKey },
  ].map((item) => ({ ...item, type: "plain", target: ["production", "preview"] }));
  const response = await vercelFetch(token, teamId, `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`, {
    method: "POST",
    body: JSON.stringify(variables),
  });
  if (!response.ok) throw new Error((await readApiError(response)) || "Failed to configure project environment variables");
}

async function createDeployment({ token, teamId, projectId, projectName, files }: { token: string; teamId: string; projectId: string; projectName: string; files: PublishFile[] }) {
  const normalized = normalizeFiles(files);
  if (normalized.length === 0) throw new Error("No files to publish");
  const response = await vercelFetch(token, teamId, "/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1", {
    method: "POST",
    body: JSON.stringify({
      name: projectName,
      project: projectId,
      target: "production",
      files: normalized,
      projectSettings: { framework: "vite", installCommand: "npm install", buildCommand: "npm run build", outputDirectory: "dist" },
      meta: { platform: "cryzo" },
    }),
  });
  if (!response.ok) throw new Error((await readApiError(response)) || `Vercel deployment failed (${response.status})`);
  return (await response.json()) as { id: string; url?: string; readyState?: string; status?: string; alias?: string[] };
}

async function waitForDeployment(token: string, teamId: string, deploymentId: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const response = await vercelFetch(token, teamId, `/v13/deployments/${encodeURIComponent(deploymentId)}`);
    if (!response.ok) break;
    const deployment = (await response.json()) as { readyState?: string; status?: string; alias?: string[]; url?: string; errorMessage?: string };
    const state = deployment.readyState || deployment.status;
    if (state === "READY") return deployment;
    if (state === "ERROR" || state === "CANCELED") throw new Error(deployment.errorMessage || `Cryzo hosting deployment ${state.toLowerCase()}`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function getProjectDomain(token: string, teamId: string, projectId: string, hostname: string) {
  const response = await vercelFetch(token, teamId, `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}`);
  if (!response.ok) return null;
  return (await response.json()) as ProjectDomain;
}

async function addOrReadDomain(token: string, teamId: string, projectId: string, hostname: string) {
  let domain = await getProjectDomain(token, teamId, projectId, hostname);
  if (domain) return domain;
  const addDomain = await vercelFetch(token, teamId, `/v10/projects/${encodeURIComponent(projectId)}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: hostname }),
  });
  if (addDomain.ok) return (await addDomain.json()) as ProjectDomain;
  if (addDomain.status === 409 || addDomain.status === 400) {
    domain = await getProjectDomain(token, teamId, projectId, hostname);
    if (domain) return domain;
  }
  throw new Error((await readApiError(addDomain)) || `Unable to attach ${hostname}`);
}

async function httpsIsReady(hostname: string) {
  try {
    const response = await fetch(`https://${hostname}/`, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function waitForHttps(hostname: string, attempts = 1) {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await httpsIsReady(hostname)) return true;
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

async function ensureCryzoSubdomain({ token, teamId, projectId, hostname, hostingDomain, sslAttempts = 1 }: { token: string; teamId: string; projectId: string; hostname: string; hostingDomain: string; sslAttempts?: number }): Promise<DomainResult> {
  let domain: ProjectDomain;
  try {
    domain = await addOrReadDomain(token, teamId, projectId, hostname);
  } catch (error) {
    return { assigned: false, verified: false, misconfigured: true, sslReady: false, setupRequired: false, sslPending: false, error: error instanceof Error ? error.message : "Unable to attach Cryzo subdomain" };
  }
  if (!domain.verified) {
    const verify = await vercelFetch(token, teamId, `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`, { method: "POST" });
    if (verify.ok) domain = (await verify.json()) as ProjectDomain;
  }
  const config = await getDomainConfig(token, teamId, hostname, projectId);
  if (!config) return { assigned: false, verified: Boolean(domain.verified), misconfigured: true, sslReady: false, setupRequired: false, sslPending: false, verification: domain.verification, error: "Vercel could not inspect the Cryzo subdomain configuration yet. Cryzo can re-check it without rebuilding the app." };
  const misconfigured = Boolean(config.misconfigured);
  const verified = Boolean(domain.verified);
  const dns = verificationInstruction(domain.verification) || dnsInstructionFromConfig(config, hostingDomain);
  if (!verified) return { assigned: false, verified: false, misconfigured, sslReady: false, setupRequired: true, sslPending: false, dns, verification: domain.verification, error: "Cryzo owns the deployment, but Vercel still needs domain verification before it can serve this subdomain. No rebuild is required." };
  if (misconfigured) return { assigned: false, verified: true, misconfigured: true, sslReady: false, setupRequired: true, sslPending: false, dns, verification: domain.verification, error: "One-time DNS setup is required for Cryzo Hosting. Keep the record in place and wait for DNS propagation; you do not need to rebuild the app." };
  const sslReady = await waitForHttps(hostname, sslAttempts);
  if (!sslReady) return { assigned: false, verified: true, misconfigured: false, sslReady: false, setupRequired: false, sslPending: true, dns: null, verification: domain.verification, error: "DNS is configured and Vercel is provisioning SSL. You do not need to redeploy; Cryzo will re-check this existing deployment." };
  return { assigned: true, verified: true, misconfigured: false, sslReady: true, setupRequired: false, sslPending: false, dns: null, verification: domain.verification };
}

async function ensureExternalDomain({ token, teamId, projectId, hostname, sslAttempts = 1 }: { token: string; teamId: string; projectId: string; hostname: string; sslAttempts?: number }): Promise<DomainResult> {
  let domain: ProjectDomain;
  try {
    domain = await addOrReadDomain(token, teamId, projectId, hostname);
  } catch (error) {
    return { assigned: false, verified: false, misconfigured: true, sslReady: false, setupRequired: true, sslPending: false, error: error instanceof Error ? error.message : "Unable to attach custom domain" };
  }
  if (!domain.verified) {
    const verify = await vercelFetch(token, teamId, `/v9/projects/${encodeURIComponent(projectId)}/domains/${encodeURIComponent(hostname)}/verify`, { method: "POST" });
    if (verify.ok) domain = (await verify.json()) as ProjectDomain;
  }
  const config = await getDomainConfig(token, teamId, hostname, projectId);
  if (!config) {
    return {
      assigned: false,
      verified: Boolean(domain.verified),
      misconfigured: true,
      sslReady: false,
      setupRequired: true,
      sslPending: false,
      dns: verificationInstruction(domain.verification),
      verification: domain.verification,
      error: "Vercel is still preparing domain configuration. Publish again after adding any verification record shown.",
    };
  }
  const verified = Boolean(domain.verified);
  const misconfigured = Boolean(config.misconfigured);
  const dns = verificationInstruction(domain.verification) || customDnsInstruction(config, hostname);
  if (!verified) {
    return { assigned: false, verified: false, misconfigured, sslReady: false, setupRequired: true, sslPending: false, dns, verification: domain.verification, error: "Verify ownership of this domain at your registrar, then publish again." };
  }
  if (misconfigured) {
    return { assigned: false, verified: true, misconfigured: true, sslReady: false, setupRequired: true, sslPending: false, dns, verification: domain.verification, error: "Point this domain to Vercel using the DNS record shown, then publish again after DNS propagates." };
  }
  const sslReady = await waitForHttps(hostname, sslAttempts);
  if (!sslReady) {
    return { assigned: false, verified: true, misconfigured: false, sslReady: false, setupRequired: false, sslPending: true, dns: null, verification: domain.verification, error: "The domain is configured and SSL is provisioning. No rebuild is required." };
  }
  return { assigned: true, verified: true, misconfigured: false, sslReady: true, setupRequired: false, sslPending: false, dns: null, verification: domain.verification };
}

async function requireConversation(req: Request, conversationId: string) {
  const token = getBearerToken(req);
  if (!token) throw new Error("Unauthorized");
  const conversation = await fetchQuery(api.conversations.get, { id: conversationId as Id<"conversations"> }, { token });
  if (!conversation) throw new Error("Conversation not found");
  return { token, conversation };
}

async function chooseSlug({ token, conversationId, requestedSlug, fallback }: { token: string; conversationId: string; requestedSlug?: string; fallback: string }) {
  const requested = sanitizeSlug(requestedSlug || fallback);
  if (RESERVED_SLUGS.has(requested)) throw new Error("That Cryzo URL is reserved. Pick another name.");
  const availability = await fetchQuery(api.hosting.findCryzoSlug, { conversationId: conversationId as Id<"conversations">, slug: requested }, { token });
  if (availability.available) return requested;
  if (requestedSlug) throw new Error("That Cryzo URL is already taken");
  return `${requested.slice(0, 39)}-${conversationId.slice(-7).toLowerCase()}`;
}

function getPlatformConfig() {
  const platformToken = process.env.CRYZO_VERCEL_TOKEN || process.env.VERCEL_PLATFORM_TOKEN || process.env.VERCEL_TOKEN;
  const teamId = process.env.CRYZO_VERCEL_TEAM_ID || process.env.VERCEL_TEAM_ID || "team_ZityBkke0oJwGHtvANucmg3m";
  const hostingDomain = (process.env.CRYZO_HOSTING_DOMAIN || "cryzo.me").replace(/^https?:\/\//, "").replace(/^\*\./, "").replace(/\/$/, "");
  return { platformToken, teamId, hostingDomain };
}

function isExternalCustomDomain(value: string | undefined, hostingDomain: string) {
  return Boolean(value && value !== hostingDomain && !value.endsWith(`.${hostingDomain}`));
}

export async function GET(req: Request) {
  try {
    const conversationId = new URL(req.url).searchParams.get("conversationId") || "";
    if (!conversationId) return Response.json({ error: "Missing conversationId" }, { status: 400 });
    const { token, conversation } = await requireConversation(req, conversationId);
    const subscription = await fetchQuery(api.billing.getSubscription, { userId: conversation.userId }, { token });
    let target = await fetchQuery(api.hosting.getCryzoTarget, { conversationId: conversationId as Id<"conversations"> }, { token });
    const cloudBackend = await fetchQuery(api.cloudAdmin.getApp, { conversationId: conversationId as Id<"conversations"> }, { token }).catch(() => null);
    const { platformToken, teamId, hostingDomain } = getPlatformConfig();
    let hostingHealth: Record<string, unknown> | null = null;
    let domainStatus: DomainResult | null = null;
    let customDomainStatus: DomainResult | null = null;

    if (platformToken && target?.slug && target.targetId) {
      const hostname = `${target.slug}.${hostingDomain}`;
      const cryzoUrl = `https://${hostname}`;
      domainStatus = await ensureCryzoSubdomain({ token: platformToken, teamId, projectId: target.targetId, hostname, hostingDomain, sslAttempts: 1 });
      let resolvedUrl = domainStatus.assigned ? cryzoUrl : target.url;
      let resolvedCustomDomain = domainStatus.assigned ? hostname : target.customDomain;

      if (isExternalCustomDomain(target.customDomain, hostingDomain)) {
        customDomainStatus = await ensureExternalDomain({ token: platformToken, teamId, projectId: target.targetId, hostname: target.customDomain!, sslAttempts: 1 });
        if (customDomainStatus.assigned) {
          resolvedUrl = `https://${target.customDomain}`;
          resolvedCustomDomain = target.customDomain;
        }
      }

      if (resolvedUrl && (target.url !== resolvedUrl || target.customDomain !== resolvedCustomDomain)) {
        await fetchMutation(api.hosting.upsertCryzoTarget, {
          conversationId: conversationId as Id<"conversations">,
          targetId: target.targetId,
          slug: target.slug,
          url: resolvedUrl,
          deploymentId: target.deploymentId,
          customDomain: resolvedCustomDomain,
        }, { token });
        target = { ...target, url: resolvedUrl, customDomain: resolvedCustomDomain };
      }
      hostingHealth = {
        dnsReady: !domainStatus.misconfigured,
        misconfigured: domainStatus.misconfigured,
        sslReady: domainStatus.sslReady,
        sslPending: domainStatus.sslPending,
        setupRequired: domainStatus.setupRequired,
        verified: domainStatus.verified,
        dns: domainStatus.dns || null,
        error: domainStatus.error || null,
      };
    } else if (platformToken) {
      const hostname = `cryzo-hosting-probe.${hostingDomain}`;
      const projectIdOrName = process.env.CRYZO_VERCEL_ROOT_PROJECT_ID || "cryzo-v11";
      const config = await getDomainConfig(platformToken, teamId, hostname, projectIdOrName);
      hostingHealth = config
        ? { dnsReady: !config.misconfigured, misconfigured: Boolean(config.misconfigured), configuredBy: config.configuredBy || null, dns: dnsInstructionFromConfig(config, hostingDomain) }
        : { dnsReady: false, misconfigured: true, dns: null };
    }

    return Response.json({
      target,
      cloudBackend,
      configured: Boolean(platformToken),
      hostingDomain,
      desiredUrl: target?.slug ? `https://${target.slug}.${hostingDomain}` : null,
      hostingHealth,
      domainStatus,
      customDomainStatus,
      plan: subscription.plan,
      brandingRequired: !canRemoveManagedBranding(subscription.plan),
      entitlements: entitlementSnapshot(subscription.plan),
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
    if (!Array.isArray(body.files) || body.files.length === 0) return Response.json({ error: "No files to publish" }, { status: 400 });

    const { token: authToken, conversation } = await requireConversation(req, body.conversationId);
    const subscription = await fetchQuery(api.billing.getSubscription, { userId: conversation.userId }, { token: authToken });
    const canUnbrand = canRemoveManagedBranding(subscription.plan);
    const requestedCustomDomain = sanitizeHostname(body.customDomain);
    if (requestedCustomDomain && !canUseExternalCustomDomains(subscription.plan)) {
      return Response.json({
        error: "Connecting a real custom domain requires Builder or above. Your Cryzo URL can still be published and renamed for free.",
        code: "CUSTOM_DOMAIN_REQUIRES_BUILDER",
        requiredPlan: "builder",
      }, { status: 402 });
    }

    const { platformToken, teamId, hostingDomain } = getPlatformConfig();
    if (!platformToken) return Response.json({ error: "Cryzo Hosting needs CRYZO_VERCEL_TOKEN on the Cryzo server.", code: "CRYZO_HOSTING_NOT_CONFIGURED" }, { status: 503 });

    const cloudBackend = await fetchMutation(api.cloudAdmin.ensureForConversation, {
      conversationId: body.conversationId as Id<"conversations">,
      name: body.projectName,
    }, { token: authToken });

    const existing = await fetchQuery(api.hosting.getCryzoTarget, { conversationId: body.conversationId as Id<"conversations"> }, { token: authToken });
    const slug = await chooseSlug({ token: authToken, conversationId: body.conversationId, requestedSlug: body.requestedSlug, fallback: existing?.slug || body.projectName });
    const projectName = existing?.targetId
      ? `cryzo-${slug}-${body.conversationId.slice(-6).toLowerCase()}`
      : sanitizeSlug(`cryzo-${slug}-${body.conversationId.slice(-6)}`);
    const project = await ensureVercelProject({ token: platformToken, teamId, projectName, existingProjectId: existing?.targetId });

    await upsertProjectEnvironment({ token: platformToken, teamId, projectId: project.id, supabase: body.supabase });

    const deployFiles = canUnbrand ? body.files : withManagedCryzoBranding(body.files);
    const deployment = await createDeployment({ token: platformToken, teamId, projectId: project.id, projectName: project.name || projectName, files: deployFiles });
    const ready = await waitForDeployment(platformToken, teamId, deployment.id);

    const desiredHostname = `${slug}.${hostingDomain}`;
    const domain = await ensureCryzoSubdomain({ token: platformToken, teamId, projectId: project.id, hostname: desiredHostname, hostingDomain, sslAttempts: 30 });
    const aliasList = ready?.alias || deployment.alias || [];
    const defaultVercelAlias = aliasList.find((alias) => alias.endsWith(".vercel.app"));
    const fallbackUrl = defaultVercelAlias
      ? `https://${defaultVercelAlias}`
      : deployment.url
        ? `https://${deployment.url}`
        : `https://${project.name || projectName}.vercel.app`;
    const cryzoUrl = `https://${desiredHostname}`;

    let customDomainResult: DomainResult | null = null;
    if (requestedCustomDomain) {
      customDomainResult = await ensureExternalDomain({
        token: platformToken,
        teamId,
        projectId: project.id,
        hostname: requestedCustomDomain,
        sslAttempts: 5,
      });
    }

    const canonicalUrl = customDomainResult?.assigned
      ? `https://${requestedCustomDomain}`
      : domain.assigned
        ? cryzoUrl
        : fallbackUrl;
    const persistedCustomDomain = requestedCustomDomain || (domain.assigned ? desiredHostname : undefined);

    await fetchMutation(api.hosting.upsertCryzoTarget, {
      conversationId: body.conversationId as Id<"conversations">,
      targetId: project.id,
      slug,
      url: canonicalUrl,
      deploymentId: deployment.id,
      customDomain: persistedCustomDomain,
    }, { token: authToken });

    return Response.json({
      success: true,
      projectId: project.id,
      deploymentId: deployment.id,
      slug,
      url: canonicalUrl,
      desiredUrl: cryzoUrl,
      fallbackUrl,
      brandingRequired: !canUnbrand,
      plan: subscription.plan,
      cloudBackend,
      subdomainAssigned: domain.assigned,
      domainVerified: domain.verified,
      domainMisconfigured: domain.misconfigured,
      domainSslReady: domain.sslReady,
      domainSetupRequired: domain.setupRequired,
      domainSslPending: domain.sslPending,
      domainError: domain.error,
      domainVerification: domain.verification,
      dns: domain.dns || null,
      customDomainRequested: Boolean(requestedCustomDomain),
      customDomain: requestedCustomDomain || null,
      customDomainAssigned: Boolean(customDomainResult?.assigned),
      customDomainVerified: customDomainResult?.verified ?? false,
      customDomainError: customDomainResult?.error || null,
      customDomainDns: customDomainResult?.dns || null,
      customDomainVerification: customDomainResult?.verification || null,
      state: ready?.readyState || ready?.status || deployment.readyState || deployment.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cryzo hosting publish failed";
    const status = message === "Unauthorized" ? 401 : /valid custom domain/i.test(message) ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
