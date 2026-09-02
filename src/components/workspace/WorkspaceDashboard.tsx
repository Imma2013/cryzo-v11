"use client";

import { Component, useState, type ErrorInfo, type ReactNode } from "react";
import { useQuery } from "convex/react";
import {
  AppWindow,
  Braces,
  ChevronRight,
  Code2,
  Database,
  ExternalLink,
  Globe2,
  KeyRound,
  Loader2,
  Users,
} from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";

type DashboardSection = "data" | "users" | "apps" | "code" | "domains";

const NAVIGATION = [
  { id: "data" as const, label: "Data", icon: Database },
  { id: "users" as const, label: "Users", icon: Users },
  { id: "apps" as const, label: "Apps", icon: AppWindow },
  { id: "code" as const, label: "Code", icon: Code2 },
  { id: "domains" as const, label: "Domains", icon: Globe2 },
];

function WorkspaceDashboardContent({
  conversationId,
  children,
  onOpenCode,
}: {
  conversationId: Id<"conversations">;
  children?: ReactNode;
  onOpenCode?: () => void;
}) {
  const { authToken, isAuthenticated, isLoading: authLoading } = useAuth();
  const ready = !authLoading && isAuthenticated && Boolean(authToken);
  const [section, setSection] = useState<DashboardSection>("data");
  const [entityName, setEntityName] = useState("");
  const overview = useQuery(
    api.cloudAdmin.getOverview,
    ready ? { conversationId } : "skip",
  );
  const publishTarget = useQuery(
    api.hosting.getCryzoTarget,
    ready ? { conversationId } : "skip",
  );
  const records = useQuery(
    api.cloudAdmin.listRecords,
    ready && entityName ? { conversationId, entityName } : "skip",
  );

  const selectSection = (next: DashboardSection) => {
    if (next === "code" && onOpenCode) {
      onOpenCode();
      return;
    }
    setSection(next);
  };

  const users = (overview?.users || []) as Array<Record<string, unknown>>;
  const entities = overview?.entities || [];
  const target = publishTarget as
    | { url?: string; customDomain?: string; slug?: string }
    | null
    | undefined;

  const content = (() => {
    if (overview === undefined || publishTarget === undefined) {
      return (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
          <Loader2 size={16} className="animate-spin" /> Loading project dashboard…
        </div>
      );
    }

    if (section === "code") return <div className="h-full min-h-0">{children}</div>;

    if (section === "users") {
      return (
        <section className="mx-auto w-full max-w-5xl p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">Authentication</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Users</h2>
          <p className="mt-1 text-sm text-zinc-500">People signed in to this generated app.</p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-black/40">
            {users.length === 0 ? (
              <div className="px-5 py-12 text-center text-sm text-zinc-500">No app users yet.</div>
            ) : (
              users.map((user, index) => (
                <div key={String(user._id || index)} className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3 last:border-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-500/15 text-sm font-semibold text-sky-300">
                    {String(user.name || user.email || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{String(user.name || user.email || "App user")}</p>
                    <p className="truncate text-xs text-zinc-500">{String(user.email || "No email")}</p>
                  </div>
                  <span className="rounded-full border border-zinc-800 px-2 py-1 text-[10px] text-zinc-400">{String(user.role || "member")}</span>
                </div>
              ))
            )}
          </div>
        </section>
      );
    }

    if (section === "apps") {
      const apps = [
        { name: "GitHub", detail: "Source control and repository sync", href: "/chat/apps#github", icon: Braces },
        { name: "Vercel", detail: "Hosting, previews and production deploys", href: "/chat/apps#vercel", icon: ExternalLink },
        { name: "Stripe", detail: "Payments, subscriptions and checkout", href: "/chat/apps#stripe", icon: KeyRound },
        { name: "Connections", detail: "Connect more tools to your project", href: "/chat/apps#connections", icon: AppWindow },
      ];
      return (
        <section className="mx-auto w-full max-w-5xl p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">Project services</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Apps</h2>
          <p className="mt-1 text-sm text-zinc-500">Manage the services attached to this project.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {apps.map((app) => {
              const Icon = app.icon;
              return (
                <a key={app.name} href={app.href} className="group rounded-2xl border border-zinc-800 bg-black/40 p-5 transition hover:border-zinc-600 hover:bg-zinc-900/60">
                  <div className="flex items-center justify-between">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-zinc-200"><Icon size={18} /></span>
                    <ChevronRight size={16} className="text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-white" />
                  </div>
                  <h3 className="mt-5 font-semibold text-white">{app.name}</h3>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">{app.detail}</p>
                </a>
              );
            })}
          </div>
        </section>
      );
    }

    if (section === "domains") {
      return (
        <section className="mx-auto w-full max-w-5xl p-5 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-400">Publishing</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">Domains</h2>
          <p className="mt-1 text-sm text-zinc-500">Your live Cryzo address and custom domain.</p>
          <div className="mt-6 rounded-2xl border border-zinc-800 bg-black/40 p-5">
            {target?.url ? (
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-300"><Globe2 size={20} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">{target.customDomain ? "Custom domain" : "Cryzo domain"}</p>
                  <p className="truncate text-sm font-medium text-white">{target.customDomain || target.url}</p>
                </div>
                <a href={target.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-black">
                  Open site <ExternalLink size={13} />
                </a>
              </div>
            ) : (
              <div className="py-8 text-center">
                <Globe2 className="mx-auto text-zinc-700" size={28} />
                <p className="mt-3 text-sm font-medium text-zinc-300">No domain published yet</p>
                <p className="mt-1 text-xs text-zinc-600">Use Publish to create the project’s live Cryzo URL.</p>
              </div>
            )}
          </div>
        </section>
      );
    }

    return (
      <section className="mx-auto w-full max-w-6xl p-5 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-rose-400">Convex Cloud</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold text-white">Data</h2>
            <p className="mt-1 text-sm text-zinc-500">Browse the live tables created by this app.</p>
          </div>
          <span className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
            {entities.length} {entities.length === 1 ? "table" : "tables"}
          </span>
        </div>
        {entities.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-zinc-800 py-16 text-center">
            <Database className="mx-auto text-zinc-700" size={30} />
            <p className="mt-3 text-sm font-medium text-zinc-300">No data tables yet</p>
            <p className="mt-1 text-xs text-zinc-600">Tables appear here when Cryzo adds cloud entities to the app.</p>
          </div>
        ) : (
          <div className="mt-6 grid min-h-0 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
            <div className="space-y-2">
              {entities.map((entity) => (
                <button
                  key={entity.name}
                  type="button"
                  onClick={() => setEntityName(entity.name)}
                  className={`flex w-full items-center justify-between rounded-xl border px-3 py-3 text-left ${entityName === entity.name ? "border-rose-500/50 bg-rose-500/10 text-white" : "border-zinc-800 bg-black/40 text-zinc-400 hover:border-zinc-700"}`}
                >
                  <span className="truncate text-sm font-medium">{entity.name}</span>
                  <span className="text-[10px] text-zinc-600">{entity.recordCount}</span>
                </button>
              ))}
            </div>
            <div className="min-h-56 overflow-auto rounded-2xl border border-zinc-800 bg-black/40 p-4">
              {!entityName ? (
                <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-600">Choose a table to inspect its rows.</div>
              ) : records === undefined ? (
                <div className="flex h-full min-h-48 items-center justify-center"><Loader2 className="animate-spin text-zinc-500" size={18} /></div>
              ) : records.length === 0 ? (
                <div className="flex h-full min-h-48 items-center justify-center text-sm text-zinc-600">This table has no rows yet.</div>
              ) : (
                <div className="space-y-2">
                  {records.map((record) => (
                    <pre key={record._id} className="overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-[11px] leading-5 text-zinc-300">
                      {JSON.stringify(record.data, null, 2)}
                    </pre>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  })();

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[#08090b] md:grid-cols-[190px_minmax(0,1fr)] md:grid-rows-1">
      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-800 bg-[#0b0d10] p-2 md:block md:border-b-0 md:border-r md:p-3">
        <div className="mb-4 hidden px-2 pt-2 md:block">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Project</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{overview?.app?.name || "Cryzo app"}</p>
        </div>
        {NAVIGATION.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectSection(item.id)}
              className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-xs transition md:mb-1 md:w-full ${active ? "bg-white text-black" : "text-zinc-400 hover:bg-zinc-900 hover:text-white"}`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <main className="min-h-0 overflow-auto">{content}</main>
    </div>
  );
}


type DashboardBoundaryProps = {
  children: ReactNode;
};

type DashboardBoundaryState = {
  error: string | null;
};

class DashboardBoundary extends Component<
  DashboardBoundaryProps,
  DashboardBoundaryState
> {
  state: DashboardBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): DashboardBoundaryState {
    return {
      error: error instanceof Error ? error.message : "The project dashboard could not load.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("[workspace/dashboard]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-[#08090b] p-6 text-center">
          <div className="max-w-md rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
            <h3 className="text-base font-semibold text-white">Dashboard needs to reconnect</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Your project is safe. Refresh the dashboard after your Cryzo session reconnects.
            </p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function WorkspaceDashboard(props: {
  conversationId: Id<"conversations">;
  children?: ReactNode;
  onOpenCode?: () => void;
}) {
  return (
    <DashboardBoundary>
      <WorkspaceDashboardContent {...props} />
    </DashboardBoundary>
  );
}
