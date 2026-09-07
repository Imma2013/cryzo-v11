"use client";

import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import {
  FolderUp,
  Globe2,
  Import,
  Loader2,
  X,
} from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { ModelSelection } from "@/lib/ai/models";
import type { ArtifactAction } from "@/lib/workspace/types";

type ImportedFile = { path: string; content: string };
type ImportPayload = {
  title: string;
  files: ImportedFile[];
  startCommand?: string | null;
  warnings?: string[];
  source?: string;
};

type ImportMode = "github" | "website";

const MAX_FOLDER_FILES = 120;
const MAX_FOLDER_FILE_BYTES = 180_000;
const MAX_FOLDER_TOTAL_BYTES = 2_000_000;

const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.cache|\.turbo)(\/|$)/i;
const BINARY_FILE = /\.(png|jpe?g|gif|webp|avif|ico|pdf|zip|gz|woff2?|ttf|otf|mp3|mp4|mov|webm|wasm)$/i;
const SECRET_FILE = /(^|\/)(\.env|\.env\.(local|production|development))$/i;

function GitHubMark({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.4 7.86 10.93.58.1.79-.25.79-.56v-2.14c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.42-2.69 5.39-5.25 5.67.42.36.78 1.07.78 2.15v3.18c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

function sanitizeTitle(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 80) || "Imported project";
}

function startCommandFromFiles(files: ImportedFile[]) {
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

function ensureStaticHtmlPackage(files: ImportedFile[], projectName: string) {
  if (files.some((file) => file.path === "package.json")) return files;
  if (!files.some((file) => file.path === "index.html")) return files;
  return [
    ...files,
    {
      path: "package.json",
      content: JSON.stringify(
        {
          name:
            projectName
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "") || "imported-site",
          private: true,
          scripts: { dev: "vite --host 0.0.0.0", build: "vite build" },
          devDependencies: { vite: "5.4.21" },
        },
        null,
        2,
      ),
    },
  ];
}

export function ProjectImport({
  userId,
  modelSelection,
}: {
  userId: Id<"users">;
  modelSelection: ModelSelection;
}) {
  const router = useRouter();
  const createConversation = useMutation(api.conversations.create);
  const updateTitle = useMutation(api.conversations.updateTitle);
  const removeConversation = useMutation(api.conversations.remove);
  const createArtifact = useMutation(api.artifacts.create);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<ImportMode | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistImport = async (payload: ImportPayload) => {
    const title = sanitizeTitle(payload.title);
    const files = ensureStaticHtmlPackage(payload.files, title).slice(0, MAX_FOLDER_FILES);
    if (!files.length) throw new Error("No importable project files were found.");

    let conversationId: Id<"conversations"> | null = null;
    try {
      conversationId = await createConversation({
        userId,
        chatMode: "build",
        projectPlatforms: ["web"],
        modelProvider: modelSelection.providerId,
        modelId: modelSelection.modelId,
        modelCredentialMode: modelSelection.credentialMode,
        modelBaseUrl: modelSelection.baseURL,
      });

      const actions: ArtifactAction[] = files.map((file) => ({
        type: "file",
        filePath: file.path.replace(/^\/+/, ""),
        content: file.content,
      }));
      if (files.some((file) => file.path === "package.json")) {
        actions.push({ type: "shell", content: "npm install --no-audit --no-fund" });
      }
      const startCommand = payload.startCommand || startCommandFromFiles(files);
      if (startCommand) actions.push({ type: "start", content: startCommand });

      await createArtifact({
        conversationId,
        artifactId: `import:${Date.now()}:${crypto.randomUUID()}`,
        title: `Imported ${title}`,
        actions,
      });
      await updateTitle({ id: conversationId, title });

      if (payload.warnings?.length) {
        sessionStorage.setItem(
          `cryzo:import-warnings:${String(conversationId)}`,
          JSON.stringify(payload.warnings),
        );
      }
      if (payload.source) {
        sessionStorage.setItem(`cryzo:import-source:${String(conversationId)}`, payload.source);
      }

      router.push(`/chat/${conversationId}`);
    } catch (importError) {
      if (conversationId) {
        await removeConversation({ id: conversationId }).catch(() => {});
      }
      throw importError;
    }
  };

  const importRemote = async () => {
    if (!mode || !url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/import/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = (await response.json()) as ImportPayload & { error?: string };
      if (!response.ok) throw new Error(data.error || "Import failed");
      await persistImport(data);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const importFolder = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    if (!selected.length || busy) return;

    setBusy(true);
    setError(null);
    try {
      const rootName = selected[0]?.webkitRelativePath?.split("/")[0] || "Imported folder";
      const files: ImportedFile[] = [];
      let totalBytes = 0;

      for (const file of selected) {
        if (files.length >= MAX_FOLDER_FILES) break;
        const relative = file.webkitRelativePath
          ? file.webkitRelativePath.split("/").slice(1).join("/")
          : file.name;
        if (!relative || SKIP_PATH.test(relative) || BINARY_FILE.test(relative) || SECRET_FILE.test(relative)) {
          continue;
        }
        if (file.size > MAX_FOLDER_FILE_BYTES || totalBytes + file.size > MAX_FOLDER_TOTAL_BYTES) continue;
        totalBytes += file.size;
        files.push({ path: relative, content: await file.text() });
      }

      const normalized = ensureStaticHtmlPackage(files, rootName);
      await persistImport({
        title: rootName,
        files: normalized,
        startCommand: startCommandFromFiles(normalized),
        warnings:
          selected.length > normalized.length
            ? ["Binary, generated, secret, oversized, or excess files were skipped during folder import."]
            : [],
        source: "Local folder",
      });
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Folder import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-600">
          <Import size={12} /> Import
        </span>
        <button
          type="button"
          onClick={() => {
            setMode("github");
            setUrl("");
            setError(null);
          }}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
        >
          <GitHubMark size={14} /> GitHub URL
        </button>
        <button
          type="button"
          onClick={() => folderInputRef.current?.click()}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderUp size={14} />} Folder
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("website");
            setUrl("");
            setError(null);
          }}
          disabled={busy}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
        >
          <Globe2 size={14} /> Website URL
        </button>
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void importFolder(event)}
          {...({ webkitdirectory: "", directory: "" } as any)}
        />
      </div>

      {error && !mode && (
        <p className="mt-2 text-center text-xs text-red-400">{error}</p>
      )}

      {mode && (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => !busy && setMode(null)}
            aria-label="Close import dialog"
          />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-white shadow-2xl shadow-black">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">
                  {mode === "github" ? "Import a GitHub project" : "Remix a website"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {mode === "github"
                    ? "Paste a public GitHub repository URL. Cryzo will import the editable source files and run them in a WebContainer."
                    : "Paste a deployed website URL. Cryzo will import an editable HTML/CSS remix of the page; private framework source cannot be recovered from a deployment."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !busy && setMode(null)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-900 hover:text-white"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            <label className="mt-5 block text-xs font-medium text-zinc-400">
              {mode === "github" ? "GitHub repository URL" : "Website URL"}
            </label>
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void importRemote();
              }}
              placeholder={mode === "github" ? "https://github.com/owner/repo" : "https://example.com"}
              className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-zinc-600"
            />

            {error && (
              <div className="mt-3 rounded-lg border border-red-950 bg-red-950/20 px-3 py-2 text-xs leading-5 text-red-300">
                {error}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMode(null)}
                disabled={busy}
                className="h-10 rounded-lg border border-zinc-800 px-4 text-sm text-zinc-300 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void importRemote()}
                disabled={busy || !url.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Import size={15} />}
                {busy ? "Importing..." : "Import project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
