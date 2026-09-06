"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ClipboardCheck,
  ShieldAlert,
  WandSparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StoreReadinessCheck = {
  id: string;
  title: string;
  status: "pass" | "warning" | "blocking";
  detail: string;
  fix?: string;
};

export type StoreReadinessReportData = {
  overall: "ready" | "almost-ready" | "needs-improvement" | "not-ready";
  summary: string;
  checks: StoreReadinessCheck[];
  counts: { pass: number; warning: number; blocking: number };
};

const overallLabel = {
  ready: "Ready",
  "almost-ready": "Almost Ready",
  "needs-improvement": "Needs Improvement",
  "not-ready": "Not Ready",
} as const;

const scoreByOverall = {
  "not-ready": 18,
  "needs-improvement": 42,
  "almost-ready": 72,
  ready: 100,
} as const;

function statusIcon(status: StoreReadinessCheck["status"]) {
  if (status === "pass") return <CheckCircle2 size={16} className="text-emerald-400" />;
  if (status === "warning") return <AlertTriangle size={16} className="text-amber-400" />;
  return <AlertCircle size={16} className="text-red-400" />;
}

function buildFixPrompt(report: StoreReadinessReportData) {
  const actionable = report.checks.filter((check) => check.status !== "pass");
  const issueText = actionable
    .map(
      (check, index) =>
        `${index + 1}. ${check.title} [${check.status}]\nIssue: ${check.detail}${
          check.fix ? `\nSuggested fix: ${check.fix}` : ""
        }`,
    )
    .join("\n\n");

  return `Please apply the following App Store and Google Play readiness fixes to this app.

Make additive changes that preserve all existing working web and mobile features. Do not rewrite the project from scratch. Keep the current design, Cryzo Cloud/database/auth wiring, integrations, routes, and business logic unless a change is required for store compatibility. Use native/Expo-safe APIs for mobile code, preserve web behavior, and never hard-code secrets.

Store readiness findings:

${issueText || "No blocking findings were reported. Review the app for mobile-store compatibility and make only clearly necessary fixes."}

After making the changes, make sure the project still builds and is ready to be scanned again.`;
}

export function StoreReadinessReport({ report }: { report: StoreReadinessReportData }) {
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [fullReportOpen, setFullReportOpen] = useState(false);
  const fixPrompt = useMemo(() => buildFixPrompt(report), [report]);
  const actionable = report.checks.filter((check) => check.status !== "pass");
  const hasActionableIssues = actionable.length > 0;
  const score = scoreByOverall[report.overall];

  const addToChat = () => {
    window.dispatchEvent(
      new CustomEvent("cryzo:prefill-chat", {
        detail: {
          prompt: fixPrompt,
          notice: "Store fixes added to chat",
          forceBuildMode: true,
        },
      }),
    );
    window.dispatchEvent(new CustomEvent("cryzo:show-chat"));
    setAdded(true);
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(fixPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-xl shadow-black/20">
      <div className="border-b border-zinc-800 p-5 sm:p-6">
        <h3 className="text-base font-semibold text-white">Store Readiness Results</h3>
        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                report.overall === "ready"
                  ? "bg-emerald-400"
                  : report.overall === "almost-ready"
                    ? "bg-sky-400"
                    : "bg-amber-400",
              )}
              style={{ width: `${score}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-4 text-[10px] text-zinc-500 sm:text-xs">
            <span>Not Ready</span>
            <span className="text-center">Needs Improvement</span>
            <span className="text-center">Almost Ready</span>
            <span className="text-right">Ready</span>
          </div>
        </div>

        <div
          className={cn(
            "mt-5 rounded-xl border px-4 py-4 text-sm leading-6",
            report.overall === "ready"
              ? "border-emerald-900/70 bg-emerald-950/30 text-emerald-200"
              : "border-amber-900/70 bg-amber-950/30 text-amber-200",
          )}
        >
          <span className="font-semibold">{overallLabel[report.overall]}.</span>{" "}
          {report.summary}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-white">Key Issues</h4>
          <div className="flex gap-2 text-[10px]">
            {report.counts.blocking > 0 && (
              <span className="rounded-full bg-red-500/10 px-2 py-1 text-red-300">{report.counts.blocking} blocking</span>
            )}
            {report.counts.warning > 0 && (
              <span className="rounded-full bg-amber-500/10 px-2 py-1 text-amber-300">{report.counts.warning} warning</span>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {(actionable.length ? actionable : report.checks.filter((check) => check.status === "pass").slice(0, 3)).map((check) => (
            <div key={check.id} className="rounded-xl border border-zinc-800 bg-black/30 px-4 py-3">
              <div className="flex items-center gap-3">
                {statusIcon(check.status)}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-200">{check.title}</span>
                <span className={cn(
                  "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                  check.status === "pass" && "bg-emerald-500/10 text-emerald-300",
                  check.status === "warning" && "bg-amber-500/10 text-amber-300",
                  check.status === "blocking" && "bg-red-500/10 text-red-300",
                )}>{check.status}</span>
              </div>
              {check.status !== "pass" && (
                <p className="mt-2 pl-7 text-xs leading-5 text-zinc-500">{check.detail}</p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFullReportOpen((open) => !open)}
          className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-white"
        >
          {fullReportOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Full report ({report.checks.length} checks)
        </button>

        {fullReportOpen && (
          <div className="mt-3 divide-y divide-zinc-800 overflow-hidden rounded-xl border border-zinc-800">
            {report.checks.map((check) => (
              <div key={check.id} className="bg-black/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{statusIcon(check.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-100">{check.title}</div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{check.detail}</p>
                    {check.fix && (
                      <p className="mt-2 text-xs leading-5 text-zinc-300"><span className="font-medium text-white">Fix: </span>{check.fix}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasActionableIssues && (
          <div className="mt-5 border-t border-zinc-800 pt-5">
            {added && (
              <div className="mb-3 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
                Store fixes added to the Cryzo builder chat. Review and send them when ready.
              </div>
            )}
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={addToChat}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black hover:bg-zinc-200"
              >
                <WandSparkles size={16} /> Fix with AI
              </button>
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 px-4 text-sm font-medium text-zinc-200 hover:border-zinc-500"
              >
                {copied ? <ClipboardCheck size={15} /> : <Clipboard size={15} />}
                {copied ? "Copied" : "Copy fixes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
