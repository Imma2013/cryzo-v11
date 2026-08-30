"use client";

import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
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

export function StoreReadinessReport({ report }: { report: StoreReadinessReportData }) {
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
    </div>
  );
}
