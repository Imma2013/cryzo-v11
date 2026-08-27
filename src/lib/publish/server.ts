import crypto from "crypto";

export type PublishFile = {
  path: string;
  content: string;
};

type GitHubUser = {
  login: string;
};

type GitHubRepo = {
  default_branch?: string;
  html_url: string;
  private: boolean;
};

const CRYZO_WATERMARK = `
<!-- cryzo-watermark -->
<a data-cryzo-watermark href="https://cryzo.me" target="_blank" rel="noopener noreferrer" aria-label="Built with Cryzo" style="position:fixed;left:16px;bottom:16px;z-index:2147483647;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 12px;border-radius:12px;background:#050505;color:#fff;text-decoration:none;font:600 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.12);">
  <svg width="22" height="22" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="display:block;flex:none">
    <defs><linearGradient id="cryzo-watermark-gradient" x1="6" y1="5" x2="26" y2="27" gradientUnits="userSpaceOnUse"><stop stop-color="#8B5CF6"/><stop offset=".52" stop-color="#60A5FA"/><stop offset="1" stop-color="#22D3EE"/></linearGradient></defs>
    <rect width="32" height="32" rx="10" fill="#070A13"/>
    <path d="M21.8 8.4A9.3 9.3 0 1 0 23.6 22l-4.4-3a4.2 4.2 0 1 1-1-6.7l3.6-3.9Z" fill="url(#cryzo-watermark-gradient)"/>
    <path d="m20.3 13.1 4.5 2.9-4.5 2.9a5 5 0 0 0 0-5.8Z" fill="white" fill-opacity=".95"/>
  </svg>
  <span>Built with <strong>Cryzo</strong></span>
</a>
<!-- /cryzo-watermark -->`;

export function sanitizeProjectName(name: string, fallback = "cryzo-project") {
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

export function normalizePublishFiles(files: PublishFile[]) {
  return files
    .map((file) => ({
      path: file.path.replace(/^\/+/, ""),
      content: file.content,
    }))
    .filter((file) => file.path && !file.path.includes(".."));
}

export function addCryzoWatermark(files: PublishFile[]): PublishFile[] {
  const rootIndex = files.find(
    (file) => file.path.replace(/^\/+/, "").toLowerCase() === "index.html",
  );
  const fallbackIndex = files.find((file) =>
    file.path.replace(/^\/+/, "").toLowerCase().endsWith("/index.html"),
  );
  const indexFile = rootIndex || fallbackIndex;

  if (!indexFile || indexFile.content.includes("data-cryzo-watermark")) {
    return files;
  }

  const markedContent = /<\/body>/i.test(indexFile.content)
    ? indexFile.content.replace(/<\/body>/i, `${CRYZO_WATERMARK}\n</body>`)
    : `${indexFile.content}\n${CRYZO_WATERMARK}\n`;

  return files.map((file) =>
    file === indexFile ? { ...file, content: markedContent } : file,
  );
}

export async function githubFetch<T>(
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `GitHub request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function getGitHubUser(token: string) {
  return githubFetch<GitHubUser>(token, "/user");
}

export async function createOrUpdateGitHubRepo({
  token,
  repoName,
  isPrivate,
  files,
}: {
  token: string;
  repoName: string;
  isPrivate: boolean;
  files: PublishFile[];
}) {
  const user = await getGitHubUser(token);
  const repo = sanitizeProjectName(repoName);
  const normalizedFiles = normalizePublishFiles(addCryzoWatermark(files));
  if (normalizedFiles.length === 0) throw new Error("No files to publish");

  let repoInfo: GitHubRepo;
  let repoExists = true;

  try {
    repoInfo = await githubFetch<GitHubRepo>(
      token,
      `/repos/${user.login}/${repo}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Not Found") && !message.includes("404")) {
      throw error;
    }

    repoExists = false;
    repoInfo = await githubFetch<GitHubRepo>(token, "/user/repos", {
      method: "POST",
      body: JSON.stringify({
        name: repo,
        private: isPrivate,
        auto_init: true,
      }),
    });

    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  if (repoExists && repoInfo.private !== isPrivate) {
    repoInfo = await githubFetch<GitHubRepo>(
      token,
      `/repos/${user.login}/${repo}`,
      {
        method: "PATCH",
        body: JSON.stringify({ private: isPrivate }),
      },
    );
  }

  const defaultBranch = repoInfo.default_branch || "main";
  const ref = await githubFetch<{ object: { sha: string } }>(
    token,
    `/repos/${user.login}/${repo}/git/ref/heads/${defaultBranch}`,
  );
  const commit = await githubFetch<{ tree: { sha: string } }>(
    token,
    `/repos/${user.login}/${repo}/git/commits/${ref.object.sha}`,
  );
  const tree = await githubFetch<{ sha: string }>(
    token,
    `/repos/${user.login}/${repo}/git/trees`,
    {
      method: "POST",
      body: JSON.stringify({
        base_tree: commit.tree.sha,
        tree: normalizedFiles.map((file) => ({
          path: file.path,
          mode: "100644",
          type: "blob",
          content: file.content,
        })),
      }),
    },
  );
  const newCommit = await githubFetch<{ sha: string }>(
    token,
    `/repos/${user.login}/${repo}/git/commits`,
    {
      method: "POST",
      body: JSON.stringify({
        message: repoExists ? "Update from Cryzo" : "Initial commit from Cryzo",
        tree: tree.sha,
        parents: [ref.object.sha],
      }),
    },
  );

  await githubFetch(token, `/repos/${user.login}/${repo}/git/refs/heads/${defaultBranch}`, {
    method: "PATCH",
    body: JSON.stringify({
      sha: newCommit.sha,
      force: false,
    }),
  });

  return {
    owner: user.login,
    repo,
    url: repoInfo.html_url || `https://github.com/${user.login}/${repo}`,
    branch: defaultBranch,
    files: normalizedFiles.length,
  };
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

export function ensureBuildConfig(files: PublishFile[]): PublishFile[] {
  const packageJsonFile = files.find((f) => f.path.replace(/^\/+/, "") === "package.json");
  const tsconfigFile = files.find((f) => f.path.replace(/^\/+/, "") === "tsconfig.json");

  if (packageJsonFile && !tsconfigFile) {
    try {
      const pkg = JSON.parse(packageJsonFile.content);
      const buildScript = pkg.scripts?.build || "";
      if (buildScript.includes("tsc")) {
        return [
          ...files,
          {
            path: "tsconfig.json",
            content: JSON.stringify(DEFAULT_TSCONFIG, null, 2),
          },
        ];
      }
    } catch {}
  }
  return files;
}

export async function createVercelDeployment({
  token,
  projectName,
  files,
}: {
  token: string;
  projectName: string;
  files: PublishFile[];
}) {
  const name = sanitizeProjectName(projectName, "cryzo-app");
  const filesWithConfig = ensureBuildConfig(addCryzoWatermark(files));
  const normalizedFiles = normalizePublishFiles(filesWithConfig);
  if (normalizedFiles.length === 0) throw new Error("No files to publish");

  const response = await fetch(
    "https://api.vercel.com/v13/deployments?forceNew=1&skipAutoDetectionConfirmation=1",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        target: "production",
        files: normalizedFiles.map((file) => ({
          file: file.path,
          data: file.content,
        })),
        projectSettings: {
          framework: "vite",
          installCommand: "npm install",
          buildCommand: "npm run build",
          outputDirectory: "dist",
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await readApiError(response);
    throw new Error(detail || `Vercel deployment failed (${response.status})`);
  }

  const data = (await response.json()) as {
    id: string;
    url?: string;
    readyState?: string;
    status?: string;
    project?: { id?: string };
  };

  return {
    id: data.id,
    projectId: data.project?.id,
    state: data.readyState || data.status,
    url: data.url ? `https://${data.url}` : undefined,
  };
}

export async function createNetlifyDeploy({
  token,
  siteId,
  siteName,
  files,
}: {
  token: string;
  siteId?: string;
  siteName: string;
  files: PublishFile[];
}) {
  const normalizedFiles = normalizePublishFiles(
    ensureBuildConfig(addCryzoWatermark(files)),
  );
  if (normalizedFiles.length === 0) throw new Error("No files to publish");

  let targetSiteId = siteId;
  let siteUrl: string | undefined;
  let name = sanitizeProjectName(siteName, "cryzo-site");

  if (targetSiteId) {
    const existing = await fetch(
      `https://api.netlify.com/api/v1/sites/${targetSiteId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (existing.ok) {
      const site = (await existing.json()) as { id: string; name: string; ssl_url?: string; url?: string };
      targetSiteId = site.id;
      name = site.name;
      siteUrl = site.ssl_url || site.url;
    } else {
      targetSiteId = undefined;
    }
  }

  if (!targetSiteId) {
    const createSite = await fetch("https://api.netlify.com/api/v1/sites", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!createSite.ok) {
      const detail = await readApiError(createSite);
      throw new Error(detail || `Failed to create Netlify site (${createSite.status})`);
    }

    const site = (await createSite.json()) as { id: string; name: string; ssl_url?: string; url?: string };
    targetSiteId = site.id;
    name = site.name;
    siteUrl = site.ssl_url || site.url;
  }

  const digests: Record<string, string> = {};
  for (const file of normalizedFiles) {
    const path = file.path.startsWith("/") ? file.path : `/${file.path}`;
    digests[path] = crypto.createHash("sha1").update(file.content).digest("hex");
  }

  const createDeploy = await fetch(
    `https://api.netlify.com/api/v1/sites/${targetSiteId}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        files: digests,
        async: true,
        draft: false,
      }),
    },
  );

  if (!createDeploy.ok) {
    const detail = await readApiError(createDeploy);
    throw new Error(detail || `Failed to create Netlify deploy (${createDeploy.status})`);
  }

  const deploy = (await createDeploy.json()) as { id: string; required?: string[] };
  const required = new Set(deploy.required || Object.values(digests));

  for (const file of normalizedFiles) {
    const normalizedPath = file.path.startsWith("/") ? file.path : `/${file.path}`;
    if (!required.has(digests[normalizedPath])) continue;

    const encodedPath = normalizedPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/");
    const upload = await fetch(
      `https://api.netlify.com/api/v1/deploys/${deploy.id}/files${encodedPath}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
        },
        body: file.content,
      },
    );

    if (!upload.ok) {
      const detail = await readApiError(upload);
      throw new Error(detail || `Failed to upload ${file.path}`);
    }
  }

  let finalState = "uploaded";
  let deployUrl = siteUrl;
  for (let attempt = 0; attempt < 45; attempt++) {
    const status = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!status.ok) break;
    const data = (await status.json()) as {
      state?: string;
      ssl_url?: string;
      deploy_ssl_url?: string;
      url?: string;
      error_message?: string;
    };
    finalState = data.state || finalState;
    deployUrl = data.deploy_ssl_url || data.ssl_url || data.url || deployUrl;
    if (finalState === "ready" || finalState === "uploaded") break;
    if (finalState === "error") throw new Error(data.error_message || "Netlify deployment failed");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    id: deploy.id,
    siteId: targetSiteId,
    siteName: name,
    state: finalState,
    url: deployUrl,
  };
}

export async function readApiError(response: Response) {
  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const data = (await response.json()) as {
        error?: { message?: string };
        message?: string;
      };
      return data.error?.message || data.message || JSON.stringify(data);
    }
    return await response.text();
  } catch {
    return undefined;
  }
}
