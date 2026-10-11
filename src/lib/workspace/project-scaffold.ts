import type { FileMap } from "./types";

export type ScaffoldFile = { path: string; content: string };

function hasFile(files: FileMap, path: string) {
  return files[path]?.type === "file";
}

/** Only repair unambiguous React/Vite web projects, never Python or Expo. */
export function isReactViteProject(files: FileMap) {
  if (hasFile(files, "app.json") || hasFile(files, "app.config.js") ||
      hasFile(files, "app.config.ts") || hasFile(files, "requirements.txt") ||
      hasFile(files, "next.config.ts") || hasFile(files, "next.config.js") ||
      hasFile(files, "src/app/layout.tsx") || hasFile(files, "app/layout.tsx")) return false;
  return Object.keys(files).some((path) =>
    /^(src\/.*\.[jt]sx|App\.[jt]sx)$/.test(path) && files[path]?.type === "file",
  );
}

/** Starter files are only a safety net; model-authored files always win. */
const REACT_VITE_TEMPLATE: Record<string, string> = {
  "package.json": JSON.stringify({
    name: "cryzo-generated-app", version: "1.0.0", private: true, type: "module",
    scripts: { dev: "vite --host 0.0.0.0", build: "vite build", preview: "vite preview --host 0.0.0.0" },
    dependencies: { react: "^19.2.0", "react-dom": "^19.2.0", "lucide-react": "^0.468.0" },
    devDependencies: { vite: "^6.3.0", "@vitejs/plugin-react": "^4.4.0", typescript: "^5.8.0", "@types/react": "^19.0.0", "@types/react-dom": "^19.0.0" },
  }, null, 2) + "\n",
  "index.html": '<!doctype html>\n<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Cryzo Project</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  "vite.config.ts": 'import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nexport default defineConfig({ plugins: [react()], server: { host: "0.0.0.0" } });\n',
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: true, allowSyntheticDefaultImports: true, resolveJsonModule: true, isolatedModules: true, noEmit: true }, include: ["src", "vite.config.ts"] }, null, 2) + "\n",
  "src/index.css": 'html,body,#root{margin:0;min-height:100%;}*{box-sizing:border-box;}\n',
  "src/main.tsx": 'import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./index.css";\ncreateRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);\n',
  "src/App.tsx": 'export default function App() { return <main><h1>Cryzo project</h1></main>; }\n',
};

export function missingReactViteScaffold(files: FileMap): ScaffoldFile[] {
  if (hasFile(files, "package.json") || !isReactViteProject(files)) return [];
  return Object.entries(REACT_VITE_TEMPLATE)
    .filter(([path]) => !hasFile(files, path))
    .map(([path, content]) => ({ path, content }));
}

export function projectReadinessIssues(files: FileMap, command?: string | null): string[] {
  const nodeCommand = !!command && /\b(?:npm|npx|pnpm|yarn|bun)\s/.test(command);
  const isNode = hasFile(files, "package.json") || isReactViteProject(files) || nodeCommand;
  if (!isNode) return []; // Python and other project types may not use npm.
  if (!hasFile(files, "package.json")) return ["Project is missing package.json; cannot install or start a Node.js project."];
  let parsed: { scripts?: Record<string, unknown> };
  try { parsed = JSON.parse(files["package.json"].content || ""); }
  catch { return ["Project package.json contains invalid JSON."]; }
  if (!parsed || typeof parsed !== "object") return ["Project package.json must contain a JSON object."];
  if (command) {
    const match = command.match(/\b(?:npm\s+run|npm\s+run-script|pnpm\s+run|yarn\s+run|bun\s+run|npm\s+start)\s+([\w:-]+)/);
    const script = /\bnpm\s+start\b/.test(command) ? "start" : match?.[1];
    if (script && typeof parsed.scripts?.[script] !== "string") {
      return [`package.json has no scripts.${script} command.`];
    }
  }
  return [];
}
