"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  ExternalLink,
  Loader2,
  X,
} from "lucide-react";
import {
  readDeveloperToken,
  readSupabaseProject,
  storeDeveloperToken,
  storeSupabaseProject,
  type SupabaseProjectSelection,
} from "@/lib/developer-connections";

type SupabaseProject = {
  id: string;
  name: string;
  region?: string;
  status?: string;
};

type Status = {
  type: "idle" | "loading" | "success" | "error";
  message?: string;
};

export function SupabaseConnectionModal({
  open,
  onClose,
  conversationId,
}: {
  open: boolean;
  onClose: () => void;
  conversationId?: string;
}) {
  const [token, setToken] = useState("");
  const [projects, setProjects] = useState<SupabaseProject[]>([]);
  const [selected, setSelected] = useState<SupabaseProjectSelection | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  useEffect(() => {
    if (!open) return;
    setToken(readDeveloperToken("supabase"));
    setSelected(readSupabaseProject(conversationId));
    setProjects([]);
    setStatus({ type: "idle" });
  }, [conversationId, open]);

  if (!open) return null;

  const loadProjects = async () => {
    const value = token.trim();
    if (!value) return;
    setStatus({ type: "loading", message: "Loading Supabase projects…" });
    try {
      const response = await fetch("/api/developer/supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Supabase connection failed");
      storeDeveloperToken("supabase", value);
      const nextProjects = Array.isArray(data.projects) ? data.projects : [];
      setProjects(nextProjects);
      setStatus({
        type: "success",
        message: `Connected · ${nextProjects.length} project${nextProjects.length === 1 ? "" : "s"}`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Supabase connection failed",
      });
    }
  };

  const selectProject = async (projectRef: string) => {
    const value = token.trim() || readDeveloperToken("supabase");
    if (!value || !projectRef) return;
    setStatus({ type: "loading", message: "Connecting project…" });
    try {
      const response = await fetch("/api/developer/supabase/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: value, projectRef }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to select project");
      const project = data.project as SupabaseProjectSelection;
      storeDeveloperToken("supabase", value);
      storeSupabaseProject(project, conversationId);
      setSelected(project);
      setStatus({ type: "success", message: `Using ${project.name}` });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Unable to select project",
      });
    }
  };

  const disconnectProject = () => {
    storeSupabaseProject(null, conversationId);
    setSelected(null);
    setStatus({ type: "idle" });
  };

  return (
    <div className="fixed inset-0 z-[190] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        onClick={onClose}
        aria-label="Close Supabase connection"
      />
      <div className="relative z-10 w-full max-w-lg rounded-t-[28px] border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300">
            <Database size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white">Supabase</h2>
              {selected && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <CheckCircle2 size={12} /> Connected
                </span>
              )}
            </div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">
              Connect an access token, then choose the Supabase project Cryzo should use for this app.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <a
          href="https://supabase.com/dashboard/account/tokens"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
        >
          Get Supabase access token <ExternalLink size={11} />
        </a>

        <div className="mt-3 flex gap-2">
          <input
            type="password"
            value={token}
            onChange={(event) => {
              setToken(event.target.value);
              if (status.type !== "idle") setStatus({ type: "idle" });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && token.trim()) {
                event.preventDefault();
                void loadProjects();
              }
            }}
            placeholder="sbp_..."
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-base text-white outline-none placeholder:text-zinc-600 focus:border-zinc-600 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => void loadProjects()}
            disabled={!token.trim() || status.type === "loading"}
            className="inline-flex min-w-24 items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-black disabled:opacity-40"
          >
            {status.type === "loading" ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Database size={14} />
            )}
            Projects
          </button>
        </div>

        {(projects.length > 0 || selected) && (
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-zinc-400">
              Project
            </label>
            <select
              value={selected?.ref || ""}
              onChange={(event) => void selectProject(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-800 bg-black px-3 text-base text-white outline-none sm:text-sm"
            >
              <option value="">Select a project</option>
              {selected && !projects.some((project) => project.id === selected.ref) && (
                <option value={selected.ref}>{selected.name}</option>
              )}
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}{project.region ? ` · ${project.region}` : ""}
                </option>
              ))}
            </select>
            {selected && (
              <div className="mt-2 flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-xs text-zinc-500">
                  Using {selected.name} for this Cryzo project.
                </p>
                <button
                  type="button"
                  onClick={disconnectProject}
                  className="text-xs text-zinc-500 hover:text-white"
                >
                  Disconnect
                </button>
              </div>
            )}
          </div>
        )}

        {status.message && (
          <p
            className={`mt-3 text-xs ${
              status.type === "error" ? "text-red-400" : "text-emerald-400"
            }`}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
