"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
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

function statusIcon(status: StoreReadinessCheck["status"]) {
  if (status === "pass") return <CheckCircle2 size={15} className="text-emerald-400" />;
  if (status === "warning") return <AlertTriangle size={15} className="text-amber-400" />;
  return <ShieldAlert size={15} className="text-red-400" />;
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
  const fixPrompt = useMemo(() => buildFixPrompt(report), [report]);
  const hasActionableIssues = report.checks.some((check) => check.status !== "pass");

  const addToChat = () => {
    window.dispatchEvent(
      new CustomEvent("cryzo:prefill-chat", {
        detail: {
          prompt: fixPrompt,
          notice: "Fix prompt added to chat",
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
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Store readiness</div>
            <div className="mt-1 text-lg font-semibold text-white">{overallLabel[report.overall]}</div>
            <p className="mt-1 max-w-lg text-xs leading-5 text-zinc-400">{report.summary}</p>
          </div>
          <div className="flex gap-2 text-[11px]">
            <span className="rounded-full border border-emerald-900 bg-emerald-950/40 px-2.5 py-1 text-emerald-300">{report.counts.pass} pass</span>
            <span className="rounded-full border border-amber-900 bg-amber-950/40 px-2.5 py-1 text-amber-300">{report.counts.warning} warning</span>
            <span className="rounded-full border border-red-900 bg-red-950/40 px-2.5 py-1 text-red-300">{report.counts.blocking} blocking</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-800">
        {report.checks.map((check) => (
          <div key={check.id} className="p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">{statusIcon(check.status)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-zinc-100">{check.title}</div>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                      check.status === "pass" && "border-emerald-900 bg-emerald-950/40 text-emerald-300",
                      check.status === "warning" && "border-amber-900 bg-amber-950/40 text-amber-300",
                      check.status === "blocking" && "border-red-900 bg-red-950/40 text-red-300",
                    )}
                  >
                    {check.status}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-zinc-400">{check.detail}</p>
                {check.fix && (
                  <div className="mt-2 rounded-lg border border-zinc-800 bg-black/30 px-3 py-2 text-xs leading-5 text-zinc-300">
                    <span className="font-medium text-white">Suggested fix: </span>{check.fix}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasActionableIssues && (
        <div className="border-t border-zinc-800 bg-black/40 p-4">
          {added && (
            <div className="mb-3 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-300">
              Fix prompt added to chat. Review it, then press Send.
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <button
              type="button"
              onClick={addToChat}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-black hover:bg-zinc-200"
            >
              <WandSparkles size={15} /> Fix with AI
            </button>
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-sm font-medium text-zinc-200 hover:border-zinc-500 hover:text-white"
            >
              {copied ? <ClipboardCheck size={15} /> : <Clipboard size={15} />}
              {copied ? "Copied" : "Copy fix prompt"}
            </button>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-zinc-500">
            Cryzo adds the tailored fixes to your composer first. Nothing is changed until you review the prompt and send it.
          </p>
        </div>
      )}
    </div>
  );
}
