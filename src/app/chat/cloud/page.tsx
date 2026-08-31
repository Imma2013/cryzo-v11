"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  Activity,
  Cloud,
  Code2,
  Database,
  HardDrive,
  KeyRound,
  LockKeyhole,
  Shield,
  Users,
} from "lucide-react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "@/providers/AuthProvider";
import { canUseCustomBackendFunctions } from "@/lib/billing/entitlements";

const TABS = [
  { id: "data", label: "Data", icon: Database },
  { id: "users", label: "Users", icon: Users },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "functions", label: "Functions", icon: Code2 },
  { id: "secrets", label: "Secrets", icon: KeyRound },
  { id: "usage", label: "Usage", icon: Activity },
  { id: "security", label: "Security", icon: Shield },
] as const;

type TabId = (typeof TABS)[number]["id"];

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/50 p-8 text-center">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}

function AccessBadge({ value }: { value: string }) {
  return (
    <span className="rounded-full border border-zinc-800 bg-black px-2 py-0.5 text-[10px] font-medium text-zinc-400">
      {value}
    </span>
  );
}

export default function CryzoCloudPage() {
  const { userId } = useAuth();
  const [conversationId, setConversationId] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("data");
  const [selectedEntity, setSelectedEntity] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setConversationId(params.get("conversationId") || "");
    const requested = params.get("tab") as TabId | null;
    if (requested && TABS.some((tab) => tab.id === requested)) setActiveTab(requested);
  }, []);

  const overview = useQuery(
    api.cloudAdmin.getOverview,
    conversationId
      ? { conversationId: conversationId as Id<"conversations"> }
      : "skip",
  );
  const subscription = useQuery(
    api.billing.getSubscription,
    userId ? { userId: userId as Id<"users"> } : "skip",
  );
  const records = useQuery(
    api.cloudAdmin.listRecords,
    conversationId && selectedEntity
      ? {
          conversationId: conversationId as Id<"conversations">,
          entityName: selectedEntity,
        }
      : "skip",
  );

  useEffect(() => {
    if (!selectedEntity && overview?.entities?.[0]?.name) {
      setSelectedEntity(overview.entities[0].name);
    }
  }, [overview, selectedEntity]);

  const functionAccess = canUseCustomBackendFunctions(subscription?.plan);
  const totalCreditsUsed = useMemo(
    () =>
      overview?.usage?.reduce(
        (total, item) => total + Math.max(0, Number(item.credits || 0)),
        0,
      ) || 0,
    [overview],
  );

  return (
    <div className="h-full overflow-y-auto bg-black text-white">
      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950">
            <Cloud size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">Cryzo Cloud</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Database, app users, permissions and runtime usage for this project.
            </p>
          </div>
          {overview?.app ? (
            <span className="rounded-full border border-emerald-900/70 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              Active
            </span>
          ) : null}
        </div>

        <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-1.5">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-max items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
                  active ? "bg-white text-black" : "text-zinc-500 hover:bg-zinc-900 hover:text-white"
                }`}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          {!conversationId ? (
            <EmptyState
              title="Open Cloud from a project"
              text="Cryzo Cloud is project-scoped. Open the three-dot project sheet and choose Cloud."
            />
          ) : overview === undefined ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-sm text-zinc-500">
              Loading Cryzo Cloud…
            </div>
          ) : !overview.app ? (
            <EmptyState
              title="Cloud is ready when your app needs it"
              text="Cryzo automatically creates a Cloud namespace during the next Build request. Database and authentication are available on Free; no separate backend subscription is required."
            />
          ) : activeTab === "data" ? (
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
                <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-600">
                  Entities
                </div>
                <div className="space-y-1">
                  {overview.entities.map((entity) => (
                    <button
                      type="button"
                      key={entity._id}
                      onClick={() => setSelectedEntity(entity.name)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${
                        selectedEntity === entity.name
                          ? "bg-zinc-800 text-white"
                          : "text-zinc-400 hover:bg-zinc-900 hover:text-white"
                      }`}
                    >
                      <span className="truncate">{entity.name}</span>
                      <span className="text-[10px] text-zinc-600">{entity.recordCount}</span>
                    </button>
                  ))}
                  {!overview.entities.length && (
                    <p className="px-3 py-6 text-center text-xs text-zinc-600">
                      No entities yet.
                    </p>
                  )}
                </div>
              </section>

              <section className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-950">
                {selectedEntity ? (
                  <>
                    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                      <div>
                        <h2 className="text-sm font-semibold">{selectedEntity}</h2>
                        <p className="mt-0.5 text-[11px] text-zinc-600">Latest 100 records</p>
                      </div>
                      <AccessBadge
                        value={overview.entities.find((entity) => entity.name === selectedEntity)?.access || "private"}
                      />
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[620px] text-left text-xs">
                        <thead className="border-b border-zinc-800 text-zinc-600">
                          <tr>
                            <th className="px-4 py-3 font-medium">ID</th>
                            <th className="px-4 py-3 font-medium">Data</th>
                            <th className="px-4 py-3 font-medium">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(records || []).map((record) => (
                            <tr key={record._id} className="border-b border-zinc-900 align-top">
                              <td className="max-w-44 truncate px-4 py-3 font-mono text-[10px] text-zinc-500">
                                {record._id}
                              </td>
                              <td className="px-4 py-3">
                                <pre className="max-w-xl whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-zinc-300">
                                  {JSON.stringify(record.data, null, 2)}
                                </pre>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-zinc-600">
                                {new Date(record.updatedAt).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {records && records.length === 0 && (
                        <div className="px-4 py-12 text-center text-xs text-zinc-600">No records yet.</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-10 text-center text-sm text-zinc-600">Choose an entity.</div>
                )}
              </section>
            </div>
          ) : activeTab === "users" ? (
            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="border-b border-zinc-800 px-4 py-3">
                <h2 className="text-sm font-semibold">App users</h2>
                <p className="mt-1 text-xs text-zinc-600">Email/password app accounts are separate from Cryzo builder accounts.</p>
              </div>
              <div className="divide-y divide-zinc-900">
                {overview.users.map((user) => (
                  <div key={user._id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-zinc-300">
                      {(user.name || user.email).slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">{user.name || user.email}</p>
                      <p className="truncate text-xs text-zinc-600">{user.email}</p>
                    </div>
                    <AccessBadge value={user.role} />
                  </div>
                ))}
                {!overview.users.length && (
                  <div className="px-4 py-12 text-center text-xs text-zinc-600">No app users yet.</div>
                )}
              </div>
            </section>
          ) : activeTab === "usage" ? (
            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <h2 className="text-sm font-semibold">Runtime usage</h2>
                  <p className="mt-1 text-xs text-zinc-600">Auth is included. Managed database and external service operations use integration credits.</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{totalCreditsUsed}</p>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-600">recent credits</p>
                </div>
              </div>
              <div className="divide-y divide-zinc-900">
                {overview.usage.map((item) => (
                  <div key={item._id} className="flex items-center gap-3 px-4 py-3 text-xs">
                    <span className="w-20 shrink-0 capitalize text-zinc-500">{item.category}</span>
                    <span className="min-w-0 flex-1 truncate text-zinc-300">
                      {item.operation}{item.detail ? ` · ${item.detail}` : ""}
                    </span>
                    <span className={item.credits ? "text-zinc-300" : "text-emerald-400"}>
                      {item.credits ? `${item.credits} cr` : "Included"}
                    </span>
                  </div>
                ))}
                {!overview.usage.length && (
                  <div className="px-4 py-12 text-center text-xs text-zinc-600">No runtime usage yet.</div>
                )}
              </div>
            </section>
          ) : activeTab === "functions" || activeTab === "secrets" ? (
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900">
                  <LockKeyhole size={18} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">
                    {activeTab === "functions" ? "Backend functions" : "Backend secrets"}
                  </h2>
                  <p className="mt-1 max-w-xl text-xs leading-5 text-zinc-500">
                    Database, authentication and users are core Cryzo Cloud features. Arbitrary server functions, webhooks, scheduled jobs and their private secrets are Builder+.
                  </p>
                  <span className={`mt-4 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    functionAccess
                      ? "border-emerald-900 bg-emerald-950/40 text-emerald-300"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400"
                  }`}>
                    {functionAccess ? "Available on your plan" : "Builder+"}
                  </span>
                </div>
              </div>
            </section>
          ) : activeTab === "security" ? (
            <section className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs font-medium text-zinc-200">Private</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">Signed-in users only see and change their own records.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs font-medium text-zinc-200">Public read</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">Anyone can read; signed-in owners control writes.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                <p className="text-xs font-medium text-zinc-200">Public</p>
                <p className="mt-2 text-xs leading-5 text-zinc-600">Anyone can read/create; owner or admin required for updates and deletes.</p>
              </div>
            </section>
          ) : (
            <EmptyState
              title="Storage is part of Cryzo Cloud"
              text="The Cloud console surface is ready for managed uploads. File storage metering will use the same integration-credit ledger as the database and other managed services."
            />
          )}
        </div>
      </div>
    </div>
  );
}
