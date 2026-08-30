"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCw,
  Rocket,
  Smartphone,
  Store,
  Triangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileMap } from "@/lib/workspace/types";
import {
  readDeveloperToken,
  readSupabaseProject,
  storeDeveloperToken,
} from "@/lib/developer-connections";

type PublishFile = { path: string; content: string };
type PublishStatus = {
  type: "idle" | "loading" | "success" | "error";
  message?: string;
  url?: string;
};
type CryzoHostingTarget = {
  targetId?: string;
  slug?: string;
  url?: string;
  deploymentId?: string;
  customDomain?: string;
};
type MobileBuild = {
  platform: "ios" | "android";
  buildId: string;
  status?: string;
  buildUrl?: string;
  artifactUrl?: string;
};

const SOURCE_EXCLUDES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  ".cache/",
  ".cryzo/",
  ".env",
  ".env.local",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.39-5.25 5.67.42.36.78 1.07.78 2.15v3.18c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function sanitizeName(name: string, fallback = "cryzo-project") {
  return (
    name
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || fallback
  );
}

function sourceFilesFromFileMap(files: FileMap): PublishFile[] {
  return Object.entries(files)
    .filter(([, entry]) => entry.type === "file" && typeof entry.content === "string")
    .map(([path, entry]) => ({ path: path.replace(/^\/+/, ""), content: entry.content || "" }))
    .filter(
      (file) =>
        !SOURCE_EXCLUDES.some(
          (exclude) => file.path.startsWith(exclude) || file.path === exclude,
        ),
    );
}

function projectNameFromFiles(files: FileMap, conversationId: string) {
  const packageJson = files["package.json"]?.content;
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as { name?: string };
      if (pkg.name) return sanitizeName(pkg.name);
    } catch {}
  }
  return sanitizeName(`cryzo-${conversationId.slice(-8)}`);
}

const DEFAULT_TSCONFIG = {
  compilerOptions: {
    target: "ES2020",
    useDefineForClassFields: true,
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    isolatedModules: true,
    noEmit: true,
    jsx: "react-jsx",
    strict: false,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: true,
    allowJs: true,
  },
  include: ["src"],
};

function ensureBuildConfig(files: PublishFile[]): PublishFile[] {
  const packageJsonFile = files.find((file) => file.path === "package.json");
  const tsconfigFile = files.find((file) => file.path === "tsconfig.json");
  if (packageJsonFile && !tsconfigFile) {
    try {
      const pkg = JSON.parse(packageJsonFile.content);
      if (String(pkg.scripts?.build || "").includes("tsc")) {
        return [...files, { path: "tsconfig.json", content: JSON.stringify(DEFAULT_TSCONFIG, null, 2) }];
      }
    } catch {}
  }
  return files;
}

async function buildAndCollectStaticFiles(
  conversationId: string,
  onOutput: (line: string) => void,
) {
  onOutput("$ npm run build (Vercel Sandbox)\n");
  const { buildStreamingRuntime } = await import("@/lib/workspace/streaming-runtime");
  const result = await buildStreamingRuntime(conversationId);
  if (result.output) onOutput(`${result.output}\n`);
  return result.files;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(90vh-64px)] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

function StatusBlock({ status }: { status: PublishStatus }) {
  if (status.type === "idle") return null;
  return (
    <div
      className={cn(
        "mt-4 rounded-lg border px-3 py-2 text-sm",
        status.type === "success"
          ? "border-green-900 bg-green-950/40 text-green-300"
          : status.type === "error"
            ? "border-red-900 bg-red-950/40 text-red-300"
            : "border-zinc-800 bg-zinc-900 text-zinc-300",
      )}
    >
      <div className="flex items-center gap-2">
        {status.type === "loading" && <Loader2 size={14} className="animate-spin" />}
        {status.type === "success" && <CheckCircle2 size={14} />}
        <span>{status.message}</span>
      </div>
      {status.url && (
        <a href={status.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200">
          {status.url}<ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

export function PublishControls({
  files,
  conversationId,
  disabled,
  variant = "desktop",
}: {
  files: FileMap;
  conversationId: string;
  disabled: boolean;
  variant?: "desktop" | "mobile";
}) {
  const authToken = useAuthToken();
  const [githubOpen, setGithubOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const sourceFiles = useMemo(() => sourceFilesFromFileMap(files), [files]);
  const defaultName = useMemo(() => projectNameFromFiles(files, conversationId), [files, conversationId]);
  const unavailable = disabled || sourceFiles.length === 0;

  return (
    <>
      {variant === "mobile" ? (
        <button type="button" onClick={() => setPublishOpen(true)} disabled={unavailable} className="inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-blue-600 px-5 text-base font-medium text-white hover:bg-blue-500 disabled:opacity-40">
          Publish
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setGithubOpen(true)} disabled={unavailable} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-40" title="Sync to GitHub">
            <GitHubMark size={15} />
          </button>
          <button type="button" onClick={() => setPublishOpen(true)} disabled={unavailable} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40">
            <Rocket size={14} />Publish
          </button>
        </div>
      )}

      {githubOpen && <GitHubPublishModal files={sourceFiles} defaultName={defaultName} onClose={() => setGithubOpen(false)} />}
      {publishOpen && (
        <DeployPublishModal
          files={sourceFiles}
          defaultName={defaultName}
          conversationId={conversationId}
          authToken={authToken ?? null}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </>
  );
}

function GitHubPublishModal({ files, defaultName, onClose }: { files: PublishFile[]; defaultName: string; onClose: () => void }) {
  const [token, setToken] = useState(() => readDeveloperToken("github"));
  const [repoName, setRepoName] = useState(defaultName);
  const [isPrivate, setIsPrivate] = useState(false);
  const [status, setStatus] = useState<PublishStatus>({ type: "idle" });

  const publish = async () => {
    setStatus({ type: "loading", message: "Pushing files to GitHub..." });
    storeDeveloperToken("github", token);
    const response = await fetch("/api/publish/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, repoName, isPrivate, files }),
    });
    const data = await response.json();
    if (!response.ok) return setStatus({ type: "error", message: data.error || "GitHub publish failed" });
    setStatus({ type: "success", message: `Pushed ${data.files} files to ${data.owner}/${data.repo}.`, url: data.url });
  };

  return (
    <Modal title="Sync to GitHub" onClose={onClose}>
      <div className="space-y-4">
        <TextField label="GitHub access token" value={token} onChange={setToken} type="password" placeholder="github_pat_... or ghp_..." helper={<TokenHelp href="https://github.com/settings/tokens/new" note="You can also save this under Developer Connections." />} />
        <TextField label="Repository name" value={repoName} onChange={setRepoName} />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} />Private repository
        </label>
        <button type="button" onClick={() => void publish()} disabled={!token.trim() || !repoName.trim() || status.type === "loading"} className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40">
          {status.type === "loading" ? <Loader2 size={15} className="animate-spin" /> : <GitHubMark size={15} />}Sync repository
        </button>
        <StatusBlock status={status} />
      </div>
    </Modal>
  );
}

function DeployPublishModal({
  files,
  defaultName,
  conversationId,
  authToken,
  onClose,
}: {
  files: PublishFile[];
  defaultName: string;
  conversationId: string;
  authToken: string | null;
  onClose: () => void;
}) {
  const [publishMode, setPublishMode] = useState<"web" | "mobile">("web");
  const [activeProvider, setActiveProvider] = useState<"cryzo" | "vercel" | "netlify">("cryzo");
  const [vercelToken, setVercelToken] = useState(() => readDeveloperToken("vercel"));
  const [netlifyToken, setNetlifyToken] = useState(() => readDeveloperToken("netlify"));
  const [expoToken, setExpoToken] = useState(() => readDeveloperToken("expo"));
  const [expoAccount, setExpoAccount] = useState("");
  const [projectName, setProjectName] = useState(defaultName);
  const [cryzoSlug, setCryzoSlug] = useState(defaultName);
  const [hostingDomain, setHostingDomain] = useState("cryzo.me");
  const [hostingConfigured, setHostingConfigured] = useState<boolean | null>(null);
  const [existingTarget, setExistingTarget] = useState<CryzoHostingTarget | null>(null);
  const [desiredCryzoUrl, setDesiredCryzoUrl] = useState<string>(`https://${defaultName}.cryzo.me`);
  const [status, setStatus] = useState<PublishStatus>({ type: "idle" });
  const [buildLog, setBuildLog] = useState("");

  const [mobilePlatform, setMobilePlatform] = useState<"ios" | "android">("ios");
  const [mobileAppName, setMobileAppName] = useState(defaultName.replace(/-/g, " "));
  const [mobileIdentifier, setMobileIdentifier] = useState(`com.cryzo.${sanitizeName(defaultName, "app").replace(/-/g, "")}`);
  const [mobileWebUrl, setMobileWebUrl] = useState("");
  const [mobileStatus, setMobileStatus] = useState<PublishStatus>({ type: "idle" });
  const [mobileCheckPassed, setMobileCheckPassed] = useState(false);
  const [mobileBuild, setMobileBuild] = useState<MobileBuild | null>(null);
  const [iosKeyContent, setIosKeyContent] = useState("");
  const [iosKeyId, setIosKeyId] = useState("");
  const [iosIssuerId, setIosIssuerId] = useState("");
  const [iosTeamId, setIosTeamId] = useState("");
  const [iosAscAppId, setIosAscAppId] = useState("");
  const [androidServiceAccountJson, setAndroidServiceAccountJson] = useState("");
  const [androidTrack, setAndroidTrack] = useState<"internal" | "alpha" | "beta" | "production">("internal");

  useEffect(() => {
    if (!authToken) return;
    let cancelled = false;
    async function loadHosting() {
      const response = await fetch(`/api/publish/cryzo?conversationId=${encodeURIComponent(conversationId)}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (cancelled || !response.ok) return;
      setHostingConfigured(Boolean(data.configured));
      if (data.hostingDomain) setHostingDomain(data.hostingDomain);
      if (data.desiredUrl) setDesiredCryzoUrl(data.desiredUrl);
      if (data.target) {
        setExistingTarget(data.target);
        if (data.target.slug) setCryzoSlug(data.target.slug);
        if (data.target.url) setMobileWebUrl(data.target.url);
      }
    }
    void loadHosting();
    return () => { cancelled = true; };
  }, [authToken, conversationId]);

  useEffect(() => {
    setDesiredCryzoUrl(`https://${cryzoSlug}.${hostingDomain}`);
  }, [cryzoSlug, hostingDomain]);

  const deployCryzo = async () => {
    if (!authToken) return setStatus({ type: "error", message: "Your Cryzo session is still loading. Try again." });
    setStatus({ type: "loading", message: existingTarget ? "Publishing a new version..." : "Creating your Cryzo-hosted app..." });
    const supabase = readSupabaseProject();
    const response = await fetch("/api/publish/cryzo", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        conversationId,
        projectName,
        requestedSlug: cryzoSlug,
        files: ensureBuildConfig(files),
        supabase: supabase ? { url: supabase.url, publicKey: supabase.publicKey } : null,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (data.code === "CRYZO_HOSTING_NOT_CONFIGURED") setHostingConfigured(false);
      return setStatus({ type: "error", message: data.error || "Cryzo Hosting publish failed" });
    }

    setHostingConfigured(true);
    setCryzoSlug(data.slug);
    setDesiredCryzoUrl(data.desiredUrl || `https://${data.slug}.${hostingDomain}`);
    setExistingTarget({
      targetId: data.projectId,
      slug: data.slug,
      url: data.url,
      deploymentId: data.deploymentId,
      customDomain: data.subdomainAssigned ? `${data.slug}.${hostingDomain}` : undefined,
    });
    setMobileWebUrl(data.url || data.desiredUrl || "");

    if (data.subdomainAssigned) {
      setStatus({ type: "success", message: "Published to your permanent Cryzo URL.", url: data.url });
    } else {
      const dnsText = data.dns
        ? ` One-time DNS needed: ${data.dns.type} ${data.dns.name} → ${data.dns.value}.`
        : "";
      setStatus({
        type: "error",
        message: `The app deployed, but ${data.desiredUrl} is not routed yet.${dnsText}${data.domainError ? ` ${data.domainError}` : ""}`,
        url: data.fallbackUrl,
      });
    }
  };

  const deployVercel = async () => {
    setStatus({ type: "loading", message: "Creating deployment in your Vercel account..." });
    storeDeveloperToken("vercel", vercelToken);
    const response = await fetch("/api/publish/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: vercelToken, projectName, files: ensureBuildConfig(files) }),
    });
    const data = await response.json();
    if (!response.ok) return setStatus({ type: "error", message: data.error || "Vercel publish failed" });
    if (data.projectId) localStorage.setItem(`cryzo:vercel-project:${conversationId}`, data.projectId);
    setMobileWebUrl(data.url || "");
    setStatus({ type: "success", message: "Deployment started in your Vercel account.", url: data.url });
  };

  const deployNetlify = async () => {
    setStatus({ type: "loading", message: "Building project in Vercel Sandbox..." });
    setBuildLog("");
    storeDeveloperToken("netlify", netlifyToken);
    try {
      const builtFiles = await buildAndCollectStaticFiles(conversationId, (line) => setBuildLog((current) => current + line));
      const siteId = localStorage.getItem(`cryzo:netlify-site:${conversationId}`) || undefined;
      const response = await fetch("/api/publish/netlify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: netlifyToken, siteId, siteName: projectName, files: builtFiles }),
      });
      const data = await response.json();
      if (!response.ok) return setStatus({ type: "error", message: data.error || "Netlify publish failed" });
      if (data.siteId) localStorage.setItem(`cryzo:netlify-site:${conversationId}`, data.siteId);
      setMobileWebUrl(data.url || "");
      setStatus({ type: "success", message: `Netlify deployment ${data.state || "created"}.`, url: data.url });
    } catch (error) {
      setStatus({ type: "error", message: error instanceof Error ? error.message : "Netlify publish failed" });
    }
  };

  const mobileRequest = async (operation: "check" | "build" | "status" | "submit", extra: Record<string, unknown> = {}) => {
    if (!authToken) throw new Error("Your Cryzo session is still loading.");
    storeDeveloperToken("expo", expoToken);
    const response = await fetch("/api/publish/mobile", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        operation,
        conversationId,
        expoToken,
        expoAccount,
        appName: mobileAppName,
        identifier: mobileIdentifier,
        webUrl: mobileWebUrl,
        platform: mobilePlatform,
        ...extra,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Mobile ${operation} failed`);
    return data;
  };

  const checkMobile = async () => {
    setMobileStatus({ type: "loading", message: "Checking store readiness..." });
    try {
      const data = await mobileRequest("check");
      if (!data.ready) {
        setMobileCheckPassed(false);
        return setMobileStatus({ type: "error", message: (data.issues || []).join(" ") || "App is not ready." });
      }
      setMobileCheckPassed(true);
      setMobileStatus({ type: "success", message: "App passed the basic Cryzo store-readiness checks." });
    } catch (error) {
      setMobileCheckPassed(false);
      setMobileStatus({ type: "error", message: error instanceof Error ? error.message : "Check failed" });
    }
  };

  const buildMobile = async () => {
    setMobileStatus({ type: "loading", message: `Starting ${mobilePlatform === "ios" ? "iOS" : "Android"} EAS build...` });
    try {
      const data = await mobileRequest("build");
      setMobileBuild({
        platform: mobilePlatform,
        buildId: data.buildId,
        status: data.status,
        buildUrl: data.buildUrl,
        artifactUrl: data.artifactUrl,
      });
      setMobileStatus({ type: "success", message: `EAS build ${data.status || "queued"}.`, url: data.buildUrl });
    } catch (error) {
      setMobileStatus({ type: "error", message: error instanceof Error ? error.message : "Build failed" });
    }
  };

  const refreshMobile = async () => {
    if (!mobileBuild) return;
    setMobileStatus({ type: "loading", message: "Refreshing EAS build status..." });
    try {
      const data = await mobileRequest("status", { buildId: mobileBuild.buildId });
      setMobileBuild((current) => current ? { ...current, status: data.status, buildUrl: data.buildUrl || current.buildUrl, artifactUrl: data.artifactUrl || current.artifactUrl } : current);
      setMobileStatus({ type: "success", message: `Build status: ${data.status}.`, url: data.artifactUrl || data.buildUrl });
    } catch (error) {
      setMobileStatus({ type: "error", message: error instanceof Error ? error.message : "Status check failed" });
    }
  };

  const submitMobile = async () => {
    if (!mobileBuild) return;
    setMobileStatus({ type: "loading", message: `Submitting ${mobileBuild.platform === "ios" ? "to App Store Connect" : "to Google Play"}...` });
    try {
      await mobileRequest("submit", {
        buildId: mobileBuild.buildId,
        platform: mobileBuild.platform,
        ...(mobileBuild.platform === "ios"
          ? {
              iosSubmit: {
                keyContent: iosKeyContent,
                keyId: iosKeyId,
                issuerId: iosIssuerId,
                appleTeamId: iosTeamId,
                ascAppId: iosAscAppId,
              },
            }
          : {
              androidSubmit: {
                serviceAccountJson: androidServiceAccountJson,
                track: androidTrack,
              },
            }),
      });
      setMobileStatus({
        type: "success",
        message: mobileBuild.platform === "ios"
          ? "EAS submission started. The build will appear in App Store Connect/TestFlight when processing finishes."
          : "EAS submission started. The build will appear in Google Play Console when processing finishes.",
        url: mobileBuild.buildUrl,
      });
    } catch (error) {
      setMobileStatus({ type: "error", message: error instanceof Error ? error.message : "Submission failed" });
    }
  };

  const isLoading = status.type === "loading";
  const mobileLoading = mobileStatus.type === "loading";
  const mobileSubmitReady = mobileBuild?.platform === "ios"
    ? Boolean(iosKeyContent.trim() && iosKeyId.trim() && iosIssuerId.trim() && iosAscAppId.trim())
    : mobileBuild?.platform === "android"
      ? Boolean(androidServiceAccountJson.trim())
      : false;

  return (
    <Modal title="Publish Your App" onClose={onClose}>
      <div className="space-y-5">
        <div className="flex border-b border-zinc-800">
          <ModeTab active={publishMode === "web"} label="Web" icon={<Globe2 size={15} />} onClick={() => { setPublishMode("web"); setStatus({ type: "idle" }); }} />
          <ModeTab active={publishMode === "mobile"} label="Mobile app" icon={<Smartphone size={15} />} onClick={() => { setPublishMode("mobile"); setMobileStatus({ type: "idle" }); }} />
        </div>

        {publishMode === "web" ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              <ProviderButton active={activeProvider === "cryzo"} label="Cryzo Hosting" icon={<Cloud size={15} />} onClick={() => { setActiveProvider("cryzo"); setStatus({ type: "idle" }); }} />
              <ProviderButton active={activeProvider === "vercel"} label="Your Vercel" icon={<Triangle size={15} />} onClick={() => { setActiveProvider("vercel"); setStatus({ type: "idle" }); }} />
              <ProviderButton active={activeProvider === "netlify"} label="Netlify" icon={<Rocket size={15} />} onClick={() => { setActiveProvider("netlify"); setStatus({ type: "idle" }); }} />
            </div>

            <TextField label="Project name" value={projectName} onChange={setProjectName} />

            {activeProvider === "cryzo" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-zinc-400">Cryzo URL</label>
                  <div className="flex h-10 items-center overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
                    <span className="shrink-0 border-r border-zinc-800 px-3 text-xs text-zinc-500">https://</span>
                    <input value={cryzoSlug} onChange={(event) => setCryzoSlug(sanitizeName(event.target.value, "app").slice(0, 48))} className="min-w-0 flex-1 bg-transparent px-2 text-base text-white outline-none sm:text-sm" aria-label="Cryzo URL slug" />
                    <span className="shrink-0 px-3 text-xs text-zinc-500">.{hostingDomain}</span>
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">Built-in Cryzo URLs are included. Custom domains can be added separately later.</p>
                </div>

                {existingTarget?.url && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                    <div className="text-xs text-zinc-500">Currently published</div>
                    <a href={existingTarget.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-blue-300">{existingTarget.url}<ExternalLink size={13} /></a>
                    {existingTarget.url !== desiredCryzoUrl && <div className="mt-2 text-xs text-zinc-500">Target Cryzo URL: {desiredCryzoUrl}</div>}
                  </div>
                )}

                {hostingConfigured === false && (
                  <p className="rounded-lg border border-amber-900/70 bg-amber-950/30 px-3 py-2 text-xs leading-5 text-amber-300">Managed hosting needs CRYZO_VERCEL_TOKEN on the Cryzo server. Your Vercel tab remains available.</p>
                )}

                <button type="button" onClick={() => void deployCryzo()} disabled={!projectName.trim() || !cryzoSlug.trim() || isLoading || !authToken} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40">
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}{existingTarget ? "Publish new version" : "Publish with Cryzo"}
                </button>
              </div>
            )}

            {activeProvider === "vercel" && (
              <div className="space-y-4">
                <TextField label="Vercel access token" value={vercelToken} onChange={setVercelToken} type="password" placeholder="Vercel access token" helper={<TokenHelp href="https://vercel.com/account/tokens" note="You can also save this under Developer Connections." />} />
                <button type="button" onClick={() => void deployVercel()} disabled={!vercelToken.trim() || !projectName.trim() || isLoading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40">
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Triangle size={15} />}Deploy to my Vercel
                </button>
              </div>
            )}

            {activeProvider === "netlify" && (
              <div className="space-y-4">
                <TextField label="Netlify access token" value={netlifyToken} onChange={setNetlifyToken} type="password" placeholder="Netlify access token" helper={<TokenHelp href="https://app.netlify.com/user/applications#personal-access-tokens" />} />
                <button type="button" onClick={() => void deployNetlify()} disabled={!netlifyToken.trim() || !projectName.trim() || isLoading} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black disabled:opacity-40">
                  {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}Build and deploy to Netlify
                </button>
              </div>
            )}

            <StatusBlock status={status} />
            {buildLog && <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-black p-3 text-xs text-zinc-400">{buildLog}</pre>}
          </>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-base font-semibold text-white">Prepare for App Store and Google Play</h3>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Cryzo wraps your published web app in an Expo/React Native WebView, then uses EAS Build and EAS Submit.</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <ProviderButton active={mobilePlatform === "ios"} label="iOS" icon={<Store size={15} />} onClick={() => { setMobilePlatform("ios"); setMobileCheckPassed(false); setMobileIdentifier(`com.cryzo.${sanitizeName(defaultName, "app").replace(/-/g, "")}`); }} />
              <ProviderButton active={mobilePlatform === "android"} label="Android" icon={<Smartphone size={15} />} onClick={() => { setMobilePlatform("android"); setMobileCheckPassed(false); setMobileIdentifier(`com.cryzo.${sanitizeName(defaultName, "app").replace(/-/g, "")}`); }} />
            </div>

            <TextField label="Published web URL" value={mobileWebUrl} onChange={setMobileWebUrl} placeholder="https://your-app.cryzo.me" />
            <TextField label="App name" value={mobileAppName} onChange={setMobileAppName} />
            <TextField label={mobilePlatform === "ios" ? "Bundle identifier" : "Android package"} value={mobileIdentifier} onChange={setMobileIdentifier} placeholder="com.yourcompany.app" />
            <TextField label="Expo account / organization" value={expoAccount} onChange={setExpoAccount} placeholder="your-expo-account" />
            <TextField label="Expo access token" value={expoToken} onChange={setExpoToken} type="password" placeholder="Expo access token" helper={<TokenHelp href="https://expo.dev/accounts/[account]/settings/access-tokens" note="Used for EAS Build/Submit. Saved only on this device when you publish." />} />

            <MobileStep number={1} title="Check Your App" complete={mobileCheckPassed}>
              <button type="button" onClick={() => void checkMobile()} disabled={mobileLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40">
                {mobileLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}Run checks
              </button>
            </MobileStep>

            <MobileStep number={2} title="Build Store Files" complete={Boolean(mobileBuild)}>
              <button type="button" onClick={() => void buildMobile()} disabled={!mobileCheckPassed || mobileLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white disabled:opacity-40">
                {mobileLoading ? <Loader2 size={14} className="animate-spin" /> : <Smartphone size={14} />}Build with EAS
              </button>
              {mobileBuild && (
                <button type="button" onClick={() => void refreshMobile()} disabled={mobileLoading} className="ml-2 inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-700 px-3 text-sm text-zinc-200 disabled:opacity-40">
                  <RefreshCw size={14} />Refresh
                </button>
              )}
            </MobileStep>

            <MobileStep number={3} title="Submit Your App" complete={false}>
              <div className="space-y-3">
                <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs leading-5 text-zinc-400">
                  Store credentials are sent only when you press Submit. Cryzo writes them into the temporary EAS workspace, starts the submission, and deletes those credential files immediately afterward.
                </p>

                {mobileBuild?.platform === "ios" ? (
                  <div className="space-y-3">
                    <SecretTextarea
                      label="App Store Connect .p8 API key"
                      value={iosKeyContent}
                      onChange={setIosKeyContent}
                      placeholder="-----BEGIN PRIVATE KEY-----"
                      accept=".p8,text/plain"
                      uploadLabel="Load .p8 file"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="Key ID" value={iosKeyId} onChange={setIosKeyId} placeholder="ABC123DEFG" />
                      <TextField label="Issuer ID" value={iosIssuerId} onChange={setIosIssuerId} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" />
                      <TextField label="App Store Connect App ID" value={iosAscAppId} onChange={setIosAscAppId} placeholder="1234567890" />
                      <TextField label="Apple Team ID (optional)" value={iosTeamId} onChange={setIosTeamId} placeholder="A1B2C3D4E5" />
                    </div>
                    <TokenHelp href="https://appstoreconnect.apple.com/access/integrations/api" note="Create an App Store Connect API key with the access needed to submit builds." />
                  </div>
                ) : mobileBuild?.platform === "android" ? (
                  <div className="space-y-3">
                    <SecretTextarea
                      label="Google Play service-account JSON"
                      value={androidServiceAccountJson}
                      onChange={setAndroidServiceAccountJson}
                      placeholder="{ \"type\": \"service_account\", ... }"
                      accept="application/json,.json"
                      uploadLabel="Load JSON key"
                    />
                    <label className="block">
                      <span className="mb-1.5 block text-xs font-medium text-zinc-400">Google Play track</span>
                      <select
                        value={androidTrack}
                        onChange={(event) => setAndroidTrack(event.target.value as typeof androidTrack)}
                        className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-base text-white outline-none focus:border-zinc-600 sm:text-sm"
                      >
                        <option value="internal">Internal testing</option>
                        <option value="alpha">Closed / alpha</option>
                        <option value="beta">Open / beta</option>
                        <option value="production">Production</option>
                      </select>
                    </label>
                    <TokenHelp href="https://play.google.com/console/developers/api-access" note="Use a Google service account that has access to this app in Play Console." />
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Build an iOS or Android store file first.</p>
                )}

                <button type="button" onClick={() => void submitMobile()} disabled={!mobileBuild || !mobileSubmitReady || mobileLoading} className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40">
                  {mobileLoading ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />}Submit with EAS
                </button>
              </div>
            </MobileStep>

            {mobileBuild && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400">
                <div>Build ID: <span className="font-mono text-zinc-200">{mobileBuild.buildId}</span></div>
                <div className="mt-1">Status: <span className="text-zinc-200">{mobileBuild.status || "queued"}</span></div>
                {(mobileBuild.artifactUrl || mobileBuild.buildUrl) && (
                  <a href={mobileBuild.artifactUrl || mobileBuild.buildUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-blue-300">Open build<ExternalLink size={12} /></a>
                )}
              </div>
            )}
            <StatusBlock status={mobileStatus} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function ModeTab({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex items-center gap-2 border-b-2 px-5 py-3 text-sm", active ? "border-white text-white" : "border-transparent text-zinc-500 hover:text-zinc-300")}>
      {icon}{label}
    </button>
  );
}

function MobileStep({ number, title, complete, children }: { number: number; title: string; complete: boolean; children: ReactNode }) {
  return (
    <div className="border-t border-zinc-800 pt-4">
      <div className="mb-3 flex items-center gap-3">
        <div className={cn("flex h-7 w-7 items-center justify-center rounded-full border text-xs", complete ? "border-green-700 bg-green-950 text-green-300" : "border-zinc-700 text-zinc-400")}>{complete ? "✓" : number}</div>
        <div className="text-sm font-medium text-white">{title}</div>
      </div>
      <div className="pl-0 sm:pl-10">{children}</div>
    </div>
  );
}

function ProviderButton({ active, label, icon, onClick }: { active: boolean; label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2.5 text-center text-xs transition-colors", active ? "border-blue-500 bg-blue-500/10 text-white" : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white")}>
      {icon}<span className="truncate">{label}</span>
    </button>
  );
}

function TextField({ label, value, onChange, type = "text", placeholder, helper }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; helper?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-base text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm" />
      {helper && <span className="mt-2 block">{helper}</span>}
    </label>
  );
}

function SecretTextarea({
  label,
  value,
  onChange,
  placeholder,
  accept,
  uploadLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accept: string;
  uploadLabel: string;
}) {
  const loadFile = async (file?: File) => {
    if (!file) return;
    onChange(await file.text());
  };

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={5}
        spellCheck={false}
        autoComplete="off"
        className="w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-[16px] leading-5 text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
      />
      <span className="mt-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
        <span>{value.trim() ? "Credential loaded" : "Paste it above or choose a file."}</span>
        <span className="relative inline-flex cursor-pointer items-center rounded-lg border border-zinc-700 px-2.5 py-1.5 text-zinc-300 hover:border-zinc-500 hover:text-white">
          {uploadLabel}
          <input
            type="file"
            accept={accept}
            className="absolute inset-0 cursor-pointer opacity-0"
            onChange={(event) => {
              void loadFile(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </span>
      </span>
    </label>
  );
}

function TokenHelp({ href, note }: { href: string; note?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300">Get your token<ExternalLink size={12} /></a>
      {note && <><span className="text-zinc-700">|</span><span>{note}</span></>}
    </span>
  );
}
