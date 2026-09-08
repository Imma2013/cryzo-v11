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
  aiEnhanced?: boolean;
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
  if (status === "pass") {
    return <CheckCircle2 size={16} className="text-emerald-500" />;
  }
  if (status === "warning") {
    return <AlertTriangle size={16} className="text-amber-500" />;
  }
  return <AlertCircle size={16} className="text-red-500" />;
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

export function StoreReadinessReport({
  report,
  onAddToChat,
}: {
  report: StoreReadinessReportData;
  onAddToChat?: () => void;
}) {
  const [copied, setCopied] = useState(false);
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
    onAddToChat?.();
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(fixPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-zinc-900 shadow-xl shadow-black/10">
      <div className="border-b border-zinc-200 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">App Store Scan Results</h3>
          {report.aiEnhanced && (
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">
              Nemotron review included
            </span>
          )}
        </div>

        <div className="mt-5">
          <div className="h-2 overflow-hidden rounded-full bg-zinc-200">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                report.overall === "ready"
                  ? "bg-emerald-500"
                  : report.overall === "almost-ready"
                    ? "bg-blue-500"
                    : "bg-orange-500",
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
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-900",
          )}
        >
          <span className="font-semibold">{overallLabel[report.overall]}.</span>{" "}
          {report.summary}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Key Issues</h4>
          <div className="flex gap-2 text-[10px]">
            {report.counts.blocking > 0 && (
              <span className="rounded-full bg-red-50 px-2 py-1 text-red-700">
                {report.counts.blocking} blocking
              </span>
            )}
            {report.counts.warning > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                {report.counts.warning} warning
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 space-y-2">
          {(actionable.length
            ? actionable
            : report.checks.filter((check) => check.status === "pass").slice(0, 3)
          ).map((check) => (
            <div
              key={check.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {statusIcon(check.status)}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
                  {check.title}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                    check.status === "pass" && "bg-emerald-50 text-emerald-700",
                    check.status === "warning" && "bg-amber-50 text-amber-700",
                    check.status === "blocking" && "bg-red-50 text-red-700",
                  )}
                >
                  {check.status}
                </span>
              </div>
              {check.status !== "pass" && (
                <p className="mt-2 pl-7 text-xs leading-5 text-zinc-500">
                  {check.detail}
                </p>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setFullReportOpen((open) => !open)}
          className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900"
        >
          {fullReportOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Full report ({report.checks.length} checks)
        </button>

        {fullReportOpen && (
          <div className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200">
            {report.checks.map((check) => (
              <div key={check.id} className="bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">{statusIcon(check.status)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-zinc-800">{check.title}</div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{check.detail}</p>
                    {check.fix && (
                      <p className="mt-2 text-xs leading-5 text-zinc-700">
                        <span className="font-medium text-zinc-900">Fix: </span>
                        {check.fix}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {hasActionableIssues && (
          <div className="mt-5 border-t border-zinc-200 pt-5">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <button
                type="button"
                onClick={addToChat}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-black"
              >
                <WandSparkles size={16} /> Fix with AI
              </button>
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-300 px-4 text-sm font-medium text-zinc-700 hover:border-zinc-500"
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
