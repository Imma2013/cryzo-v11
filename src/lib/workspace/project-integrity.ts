import type { FileMap } from "./types";

/** Dependencies known to work with the browser-based Vite runtime. Never guess a version for an unknown package. */
const VERIFIED_DEPENDENCIES: Record<string, string> = {
  "canvas-confetti": "^1.9.3", "lucide-react": "^0.468.0", "react-icons": "^5.4.0",
  "framer-motion": "^12.0.0", "motion": "^12.0.0", "clsx": "^2.1.1",
  "tailwind-merge": "^3.0.0", "class-variance-authority": "^0.7.1",
  "date-fns": "^4.1.0", "react-router-dom": "^7.0.0", "react-router": "^7.0.0",
  "recharts": "^2.15.0", "sonner": "^2.0.0", "zustand": "^5.0.0",
  "@radix-ui/react-slot": "^1.1.0", "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-icons": "^1.3.2", "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0", "@radix-ui/react-tabs": "^1.1.0",
  "@radix-ui/react-select": "^2.1.0", "@radix-ui/react-tooltip": "^1.1.0",
  "@radix-ui/react-accordion": "^1.2.0", "@radix-ui/react-popover": "^1.1.0",
  "@radix-ui/react-checkbox": "^1.1.0", "@radix-ui/react-avatar": "^1.1.0",
  "@radix-ui/react-separator": "^1.1.0", "@radix-ui/react-switch": "^1.1.0",
};
const EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".mp3", ".woff2"];
const SCRIPT_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|mts|cts|css)$/;
const BUILTINS = new Set(["fs", "path", "url", "os", "events", "util", "stream", "crypto", "buffer", "process", "assert", "http", "https", "module", "timers"]);
export type ProjectDiagnostic = { type: "dependency" | "import" | "configuration"; file: string; message: string };
export type IntegrityResult = { repairedFiles: Array<{ path: string; content: string }>; diagnostics: ProjectDiagnostic[]; changed: boolean };

function specifiers(content: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\b(?:import|export)\s+(?:[\s\S]*?\s+from\s*)?["']([^"'\n]+)["']/g,
    /\b(?:import|require)\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const m of content.matchAll(pattern)) out.push(m[1]);
  }
  return [...new Set(out)];
}
function normalizePath(path: string): string | null {
  const result: string[] = [];
  for (const part of path.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (!result.length) return null; result.pop(); }
    else result.push(part);
  }
  return result.join("/");
}
function localImportExists(files: FileMap, from: string, spec: string): boolean {
  const path = normalizePath((from.includes("/") ? from.slice(0, from.lastIndexOf("/") + 1) : "") + spec.split(/[?#]/)[0]);
  if (!path) return false;
  return EXTENSIONS.some((ext) => files[path + ext]?.type === "file" || files[path + "/index" + ext]?.type === "file");
}
function packageName(spec: string): string {
  return spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];
}
function manifest(files: FileMap): Record<string, any> | null {
  try { const value = JSON.parse(files["package.json"]?.content || ""); return value && typeof value === "object" && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
function hasDependency(pkg: Record<string, any>, name: string): boolean {
  return ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].some((key) => typeof pkg[key]?.[name] === "string");
}
function isVite(pkg: Record<string, any>): boolean {
  return typeof pkg.devDependencies?.vite === "string" || typeof pkg.dependencies?.vite === "string" ||
    Object.values(pkg.scripts || {}).some((v) => typeof v === "string" && /\bvite\b/.test(v));
}
function postcssConfig(files: FileMap): string | null {
  return ["postcss.config.js", "postcss.config.cjs", "postcss.config.mjs", "postcss.config.ts"].find((p) => files[p]?.type === "file") || null;
}

/** Preflight with conservative, deterministic repairs; no AI or npm runs here. */
export function analyzeProject(files: FileMap, autoRepair = false): IntegrityResult {
  const pkg = manifest(files);
  if (!pkg) return { repairedFiles: [], diagnostics: [], changed: false }; // manifest syntax is checked elsewhere
  const web = isVite(pkg);
  const diagnostics: ProjectDiagnostic[] = [];
  const updated: Record<string, string> = {};
  let changed = false;
  const dep = (name: string, from: string) => {
    if (hasDependency(pkg, name) || BUILTINS.has(name)) return;
    const version = web ? VERIFIED_DEPENDENCIES[name] : undefined;
    if (version && autoRepair) {
      pkg.dependencies = { ...(pkg.dependencies || {}), [name]: version };
      changed = true;
    } else {
      diagnostics.push({ type: "dependency", file: from, message: `Missing npm dependency "${name}" referenced by ${from}. Add a compatible version to package.json.` });
    }
  };
  for (const [path, entry] of Object.entries(files)) {
    if (entry?.type !== "file" || !SCRIPT_EXTENSIONS.test(path)) continue;
    const content = entry.content || "";
    for (const spec of specifiers(content)) {
      if (spec.startsWith("node:") || spec.startsWith("https:") || spec.startsWith("http:") || spec.startsWith("data:") || spec.startsWith("virtual:")) continue;
      if (spec.startsWith(".")) {
        if (!localImportExists(files, path, spec)) diagnostics.push({ type: "import", file: path, message: `Cannot resolve local import "${spec}" from ${path}. Generate the file or correct the import path.` });
      } else if (!spec.startsWith("/") && !spec.startsWith("@/") && !spec.startsWith("~/") && !spec.startsWith("#")) {
        dep(packageName(spec), path);
      }
    }
  }
  const configPath = postcssConfig(files);
  const cssImportsV4 = Object.entries(files).some(([path, entry]) => /\.css$/.test(path) && /@import\s+["']tailwindcss["']/.test(entry.content || ""));
  const twVersion = String(pkg.dependencies?.tailwindcss || pkg.devDependencies?.tailwindcss || "");
  const tailwindV4 = cssImportsV4 || /(?:^|[~^>= ])4\./.test(twVersion);
  if (configPath) {
    const config = files[configPath].content || "";
    const usesLegacyPlugin = /\btailwindcss\s*:/i.test(config) || /require\(["']tailwindcss["']\)/.test(config) || /["']tailwindcss["']\s*:/.test(config);
    const usesNewPlugin = /@tailwindcss\/postcss/.test(config);
    if (usesLegacyPlugin && tailwindV4) {
      if (autoRepair) {
        const next = config.replace(/\btailwindcss\s*:/g, '"@tailwindcss/postcss":').replace(/require\(["']tailwindcss["']\)/g, 'require("@tailwindcss/postcss")').replace(/["']tailwindcss["']\s*:/g, '"@tailwindcss/postcss":');
        if (next !== config) { updated[configPath] = next; changed = true; }
      } else diagnostics.push({ type: "configuration", file: configPath, message: "Tailwind v4 requires @tailwindcss/postcss rather than the legacy tailwindcss PostCSS plugin." });
    }
    if (usesLegacyPlugin && !tailwindV4) {
      if (!hasDependency(pkg, "tailwindcss") && autoRepair) {
        pkg.devDependencies = { ...(pkg.devDependencies || {}), tailwindcss: "^3.4.17" }; changed = true;
      } else if (!hasDependency(pkg, "tailwindcss")) diagnostics.push({ type: "dependency", file: configPath, message: "PostCSS configuration requires tailwindcss but it is missing from package.json." });
    }
    if (usesNewPlugin || (usesLegacyPlugin && tailwindV4)) {
      if (!hasDependency(pkg, "@tailwindcss/postcss") && autoRepair) { pkg.devDependencies = { ...(pkg.devDependencies || {}), "@tailwindcss/postcss": "^4.1.0" }; changed = true; }
      else if (!hasDependency(pkg, "@tailwindcss/postcss")) diagnostics.push({ type: "dependency", file: configPath, message: "PostCSS v4 plugin @tailwindcss/postcss is missing." });
    }
    if (/\bautoprefixer\b/.test(config) && !hasDependency(pkg, "autoprefixer")) {
      if (autoRepair) { pkg.devDependencies = { ...(pkg.devDependencies || {}), autoprefixer: "^10.4.20" }; changed = true; }
      else diagnostics.push({ type: "dependency", file: configPath, message: "PostCSS uses autoprefixer but package.json does not declare it." });
    }
  }
  if (cssImportsV4 && !hasDependency(pkg, "tailwindcss")) {
    if (autoRepair) { pkg.devDependencies = { ...(pkg.devDependencies || {}), tailwindcss: "^4.1.0" }; changed = true; }
    else diagnostics.push({ type: "dependency", file: "src/index.css", message: "CSS imports Tailwind v4 but tailwindcss is not declared." });
  }
  const repairedFiles = Object.entries(updated).map(([path, content]) => ({ path, content }));
  if (changed) repairedFiles.push({ path: "package.json", content: JSON.stringify(pkg, null, 2) + "\n" });
  return { repairedFiles, diagnostics, changed };
}
