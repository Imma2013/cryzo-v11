"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Rocket,
  Triangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileMap } from "@/lib/workspace/types";

type PublishFile = {
  path: string;
  content: string;
};

type PublishStatus = {
  type: "idle" | "loading" | "success" | "error";
  message?: string;
  url?: string;
};

const SOURCE_EXCLUDES = [
  "node_modules/",
  ".git/",
  ".next/",
  "dist/",
  "build/",
  ".cache/",
  ".env",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
];

const GITHUB_TOKEN_KEY = "cryzo:github-token";
const VERCEL_TOKEN_KEY = "cryzo:vercel-token";
const NETLIFY_TOKEN_KEY = "cryzo:netlify-token";

function GitHubMark({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
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
    .map(([path, entry]) => ({
      path: path.replace(/^\/+/, ""),
      content: entry.content || "",
    }))
    .filter((file) => !SOURCE_EXCLUDES.some((exclude) => file.path.startsWith(exclude) || file.path === exclude));
}

function projectNameFromFiles(files: FileMap, conversationId: string) {
  const packageJson = files["package.json"]?.content;
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson) as { name?: string };
      if (pkg.name) return sanitizeName(pkg.name);
    } catch {}
  }

  const indexTitle = files["src/App.tsx"]?.content?.match(/<h1[^>]*>(.*?)<\/h1>/)?.[1];
  if (indexTitle) return sanitizeName(indexTitle);

  return sanitizeName(`cryzo-${conversationId.slice(-8)}`);
}

function readStoredToken(key: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) || "";
}

function storeToken(key: string, token: string) {
  if (typeof window === "undefined") return;
  if (token.trim()) localStorage.setItem(key, token.trim());
}

async function readWebContainerFiles(dir: string): Promise<PublishFile[]> {
  const { getWebContainer } = await import("@/lib/workspace/webcontainer");
  const wc = await getWebContainer();
  const entries = await wc.fs.readdir(dir, { withFileTypes: true });
  const files: PublishFile[] = [];

  for (const entry of entries) {
    const fullPath = `${dir.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isFile()) {
      const content = await wc.fs.readFile(fullPath, "utf-8");
      files.push({
        path: fullPath.replace(dir.replace(/\/$/, ""), "").replace(/^\/+/, ""),
        content,
      });
    } else if (entry.isDirectory()) {
      const nested = await readWebContainerFiles(fullPath);
      for (const file of nested) {
        files.push({
          path: `${entry.name}/${file.path}`,
          content: file.content,
        });
      }
    }
  }

  return files;
}

async function buildAndCollectStaticFiles(onOutput: (line: string) => void) {
  const { getWebContainer, runCommand } = await import("@/lib/workspace/webcontainer");
  const wc = await getWebContainer();

  onOutput("$ npm run build\n");
  const exitCode = await runCommand(wc, "npm run build", onOutput);
  if (exitCode !== 0) throw new Error("Build failed. Check the publish log.");

  for (const dir of ["dist", "build", "out"]) {
    try {
      await wc.fs.readdir(dir);
      return await readWebContainerFiles(dir);
    } catch {}
  }

  throw new Error("Could not find a static output directory. Expected dist, build, or out.");
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl shadow-black">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[calc(88vh-64px)] overflow-y-auto p-5">{children}</div>
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
        <a
          href={status.url}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200"
        >
          {status.url}
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}

export function PublishControls({
  files,
  conversationId,
  disabled,
}: {
  files: FileMap;
  conversationId: string;
  disabled: boolean;
}) {
  const [githubOpen, setGithubOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const sourceFiles = useMemo(() => sourceFilesFromFileMap(files), [files]);
  const defaultName = useMemo(
    () => projectNameFromFiles(files, conversationId),
    [files, conversationId],
  );

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setGithubOpen(true)}
          disabled={disabled || sourceFiles.length === 0}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          title="Sync to GitHub"
        >
          <GitHubMark size={15} />
        </button>
        <button
          type="button"
          onClick={() => setPublishOpen(true)}
          disabled={disabled || sourceFiles.length === 0}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Rocket size={14} />
          Publish
        </button>
      </div>

      {githubOpen && (
        <GitHubPublishModal
          files={sourceFiles}
          defaultName={defaultName}
          onClose={() => setGithubOpen(false)}
        />
      )}

      {publishOpen && (
        <DeployPublishModal
          files={sourceFiles}
          defaultName={defaultName}
          conversationId={conversationId}
          onClose={() => setPublishOpen(false)}
        />
      )}
    </>
  );
}

function GitHubPublishModal({
  files,
  defaultName,
  onClose,
}: {
  files: PublishFile[];
  defaultName: string;
  onClose: () => void;
}) {
  const [token, setToken] = useState(() => readStoredToken(GITHUB_TOKEN_KEY));
  const [repoName, setRepoName] = useState(defaultName);
  const [isPrivate, setIsPrivate] = useState(false);
  const [status, setStatus] = useState<PublishStatus>({ type: "idle" });

  const publish = async () => {
    setStatus({ type: "loading", message: "Pushing files to GitHub..." });
    storeToken(GITHUB_TOKEN_KEY, token);

    const response = await fetch("/api/publish/github", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        repoName,
        isPrivate,
        files,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus({ type: "error", message: data.error || "GitHub publish failed" });
      return;
    }

    setStatus({
      type: "success",
      message: `Pushed ${data.files} files to ${data.owner}/${data.repo}.`,
      url: data.url,
    });
  };

  return (
    <Modal title="Sync to GitHub" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Create or update a GitHub repository with the current project files.
        </p>
        <TextField
          label="GitHub access token"
          value={token}
          onChange={setToken}
          type="password"
          placeholder="ghp_..."
          helper={
            <TokenHelp
              href="https://github.com/settings/tokens/new"
              note="Required scopes: repo, read:user"
            />
          }
        />
        <TextField label="Repository name" value={repoName} onChange={setRepoName} />
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={(event) => setIsPrivate(event.target.checked)}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900"
          />
          Private repository
        </label>
        <button
          type="button"
          onClick={() => void publish()}
          disabled={!token.trim() || !repoName.trim() || status.type === "loading"}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status.type === "loading" ? <Loader2 size={15} className="animate-spin" /> : <GitHubMark size={15} />}
          Sync repository
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
  onClose,
}: {
  files: PublishFile[];
  defaultName: string;
  conversationId: string;
  onClose: () => void;
}) {
  const [activeProvider, setActiveProvider] = useState<"vercel" | "netlify">("vercel");
  const [vercelToken, setVercelToken] = useState(() => readStoredToken(VERCEL_TOKEN_KEY));
  const [netlifyToken, setNetlifyToken] = useState(() => readStoredToken(NETLIFY_TOKEN_KEY));
  const [projectName, setProjectName] = useState(defaultName);
  const [status, setStatus] = useState<PublishStatus>({ type: "idle" });
  const [buildLog, setBuildLog] = useState("");

  const deployVercel = async () => {
    setStatus({ type: "loading", message: "Creating Vercel deployment..." });
    storeToken(VERCEL_TOKEN_KEY, vercelToken);
    const response = await fetch("/api/publish/vercel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: vercelToken,
        projectName,
        files,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      setStatus({ type: "error", message: data.error || "Vercel publish failed" });
      return;
    }

    if (data.projectId) {
      localStorage.setItem(`cryzo:vercel-project:${conversationId}`, data.projectId);
    }

    setStatus({
      type: "success",
      message: "Vercel deployment started.",
      url: data.url,
    });
  };

  const deployNetlify = async () => {
    setStatus({ type: "loading", message: "Building project for Netlify..." });
    setBuildLog("");
    storeToken(NETLIFY_TOKEN_KEY, netlifyToken);

    try {
      const builtFiles = await buildAndCollectStaticFiles((line) =>
        setBuildLog((current) => current + line),
      );

      setStatus({ type: "loading", message: `Uploading ${builtFiles.length} built files to Netlify...` });
      const siteId = localStorage.getItem(`cryzo:netlify-site:${conversationId}`) || undefined;
      const response = await fetch("/api/publish/netlify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: netlifyToken,
          siteId,
          siteName: projectName,
          files: builtFiles,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        setStatus({ type: "error", message: data.error || "Netlify publish failed" });
        return;
      }

      if (data.siteId) {
        localStorage.setItem(`cryzo:netlify-site:${conversationId}`, data.siteId);
      }

      setStatus({
        type: "success",
        message: `Netlify deployment ${data.state || "created"}.`,
        url: data.url,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Netlify publish failed",
      });
    }
  };

  const isLoading = status.type === "loading";

  return (
    <Modal title="Publish" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-zinc-400">
          Deploy this project with a provider access token. OAuth can replace this later.
        </p>

        <div className="grid grid-cols-2 gap-2">
          <ProviderButton
            active={activeProvider === "vercel"}
            label="Vercel"
            icon={<Triangle size={15} />}
            onClick={() => setActiveProvider("vercel")}
          />
          <ProviderButton
            active={activeProvider === "netlify"}
            label="Netlify"
            icon={<Rocket size={15} />}
            onClick={() => setActiveProvider("netlify")}
          />
        </div>

        <TextField label="Project name" value={projectName} onChange={setProjectName} />

        {activeProvider === "vercel" ? (
          <>
            <TextField
              label="Vercel access token"
              value={vercelToken}
              onChange={setVercelToken}
              type="password"
              placeholder="vercel token"
              helper={<TokenHelp href="https://vercel.com/account/tokens" />}
            />
            <button
              type="button"
              onClick={() => void deployVercel()}
              disabled={!vercelToken.trim() || !projectName.trim() || isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Triangle size={15} />}
              Deploy to Vercel
            </button>
          </>
        ) : (
          <>
            <TextField
              label="Netlify access token"
              value={netlifyToken}
              onChange={setNetlifyToken}
              type="password"
              placeholder="netlify token"
              helper={
                <TokenHelp href="https://app.netlify.com/user/applications#personal-access-tokens" />
              }
            />
            <button
              type="button"
              onClick={() => void deployNetlify()}
              disabled={!netlifyToken.trim() || !projectName.trim() || isLoading}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Rocket size={15} />}
              Build and deploy to Netlify
            </button>
          </>
        )}

        <StatusBlock status={status} />

        {buildLog && (
          <pre className="max-h-48 overflow-auto rounded-lg border border-zinc-800 bg-black p-3 text-xs text-zinc-400">
            {buildLog}
          </pre>
        )}
      </div>
    </Modal>
  );
}

function ProviderButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm transition-colors",
        active
          ? "border-blue-500 bg-blue-500/10 text-white"
          : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  helper?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-zinc-600"
      />
      {helper && <span className="mt-2 block">{helper}</span>}
    </label>
  );
}

function TokenHelp({ href, note }: { href: string; note?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs text-zinc-500">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-blue-400 transition-colors hover:text-blue-300"
      >
        Get your token
        <ExternalLink size={12} />
      </a>
      {note && (
        <>
          <span className="text-zinc-700">|</span>
          <span>{note}</span>
        </>
      )}
    </span>
  );
}
