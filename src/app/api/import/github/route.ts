import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 120;
const MAX_FILE_BYTES = 180_000;
const MAX_TOTAL_BYTES = 2_000_000;

const SKIP_PREFIXES = [
  ".git/",
  ".github/",
  "node_modules/",
  ".next/",
  "dist/",
  "build/",
  ".cache/",
  "coverage/",
  ".turbo/",
];

const SKIP_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  ".env.development",
  ".DS_Store",
]);

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".mp4",
  ".mov",
  ".webm",
  ".wasm",
]);

type GitHubTreeItem = {
  path?: string;
  type?: "blob" | "tree";
  size?: number;
};

type ImportFile = { path: string; content: string };

function parseGitHubUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only https://github.com repository URLs are supported right now.");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) throw new Error("GitHub URL must include an owner and repository.");
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, "");
  const branch = parts[2] === "tree" && parts[3] ? decodeURIComponent(parts[3]) : undefined;
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    throw new Error("Invalid GitHub owner or repository name.");
  }
  return { owner, repo, branch };
}

function shouldInclude(filePath: string, size = 0) {
  const normalized = filePath.replace(/^\/+/, "");
  if (!normalized || normalized.includes("../")) return false;
  if (SKIP_FILES.has(normalized) || SKIP_FILES.has(path.posix.basename(normalized))) return false;
  if (SKIP_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return false;
  if (BINARY_EXTENSIONS.has(path.posix.extname(normalized).toLowerCase())) return false;
  if (size > MAX_FILE_BYTES) return false;
  return true;
}

function encodedPath(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function githubJson(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Cryzo-Project-Importer/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Repository not found or it is private. Public GitHub repositories are supported right now.");
    }
    if (response.status === 403) {
      throw new Error("GitHub rate limit reached. Try again later or import a local folder instead.");
    }
    throw new Error(`GitHub request failed with ${response.status}.`);
  }
  return await response.json();
}

function startCommandFor(files: ImportFile[]) {
  const packageJson = files.find((file) => file.path === "package.json")?.content;
  if (!packageJson) return null;
  try {
    const pkg = JSON.parse(packageJson) as { scripts?: Record<string, string> };
    if (pkg.scripts?.dev) return "npm run dev";
    if (pkg.scripts?.start) return "npm run start";
    if (pkg.scripts?.preview) return "npm run preview";
  } catch {
    return null;
  }
  return null;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string };
    const { owner, repo, branch: requestedBranch } = parseGitHubUrl(body.url || "");

    const repository = (await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`)) as {
      default_branch?: string;
      size?: number;
      private?: boolean;
    };
    if (repository.private) {
      return Response.json({ error: "Private repository import is not supported by URL yet." }, { status: 400 });
    }

    const branch = requestedBranch || repository.default_branch || "main";
    const tree = (await githubJson(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    )) as { tree?: GitHubTreeItem[]; truncated?: boolean };

    const candidates = (tree.tree || [])
      .filter((item) => item.type === "blob" && item.path && shouldInclude(item.path, item.size || 0))
      .slice(0, MAX_FILES);

    if (candidates.length === 0) {
      return Response.json({ error: "No importable text files were found in this repository." }, { status: 422 });
    }

    const files: ImportFile[] = [];
    const skipped: string[] = [];
    let totalBytes = 0;
    const branchPath = encodedPath(branch);

    for (let index = 0; index < candidates.length; index += 10) {
      const batch = candidates.slice(index, index + 10);
      const results = await Promise.allSettled(
        batch.map(async (item) => {
          const filePath = item.path!;
          const rawUrl = `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${branchPath}/${encodedPath(filePath)}`;
          const response = await fetch(rawUrl, {
            cache: "no-store",
            headers: { "User-Agent": "Cryzo-Project-Importer/1.0" },
          });
          if (!response.ok) throw new Error(`${filePath}: HTTP ${response.status}`);
          const content = await response.text();
          return { path: filePath, content };
        }),
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const filePath = batch[i].path!;
        if (result.status === "rejected") {
          skipped.push(filePath);
          continue;
        }
        const bytes = Buffer.byteLength(result.value.content, "utf8");
        if (bytes > MAX_FILE_BYTES || totalBytes + bytes > MAX_TOTAL_BYTES) {
          skipped.push(filePath);
          continue;
        }
        totalBytes += bytes;
        files.push(result.value);
      }
    }

    if (!files.some((file) => file.path === "package.json") && files.some((file) => file.path === "index.html")) {
      files.push({
        path: "package.json",
        content: JSON.stringify(
          {
            name: repo.toLowerCase().replace(/[^a-z0-9-]/g, "-") || "imported-site",
            private: true,
            scripts: { dev: "vite --host 0.0.0.0", build: "vite build" },
            devDependencies: { vite: "5.4.21" },
          },
          null,
          2,
        ),
      });
    }

    const warnings: string[] = [];
    if (tree.truncated) warnings.push("GitHub returned a truncated repository tree; only the available files were imported.");
    if ((tree.tree || []).length > candidates.length) warnings.push("Large, generated, binary, secret, and build files were skipped.");
    if (skipped.length) warnings.push(`${skipped.length} text files were skipped because of size or fetch limits.`);

    return Response.json({
      title: repo,
      files,
      startCommand: startCommandFor(files),
      warnings,
      source: `https://github.com/${owner}/${repo}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}
