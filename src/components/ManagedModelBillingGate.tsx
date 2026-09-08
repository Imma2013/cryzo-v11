"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";

const PLAN_PREVIEW = [
  { name: "Starter", price: "$20", credits: "100 message credits" },
  { name: "Builder", price: "$50", credits: "250 message credits" },
  { name: "Pro", price: "$100", credits: "500 message credits" },
  { name: "Elite", price: "$200", credits: "1,200 message credits" },
];

export function ManagedModelBillingGate() {
  const { userId } = useAuth();
  const subscription = useQuery(
    api.billing.getSubscription,
    userId ? { userId } : "skip",
  );
  const [open, setOpen] = useState(false);
  const [modelName, setModelName] = useState("this Cryzo model");

  useEffect(() => {
    if (subscription?.plan !== "free") return;

    const interceptPremiumCryzoModel = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button || button.textContent?.trim() !== "Use model") return;

      const picker = button.closest(".fixed");
      if (!picker) return;
      const heading = picker.querySelector("h2");
      if (heading?.textContent?.trim() !== "Choose your model") return;

      const selectedPaidModel = Array.from(picker.querySelectorAll("button")).find(
        (candidate) => {
          const classes = typeof candidate.className === "string" ? candidate.className : "";
          const text = candidate.textContent || "";
          return (
            classes.includes("border-zinc-500") &&
            text.includes("Starter") &&
            text.includes("AI allowance")
          );
        },
      );

      if (!selectedPaidModel) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const label = selectedPaidModel.querySelector("span")?.textContent?.trim();
      setModelName(label || "this Cryzo model");
      setOpen(true);
    };

    document.addEventListener("click", interceptPremiumCryzoModel, true);
    return () =>
      document.removeEventListener("click", interceptPremiumCryzoModel, true);
  }, [subscription?.plan]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[240] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <button
        type="button"
        className="absolute inset-0"
        onClick={() => setOpen(false)}
        aria-label="Close billing prompt"
      />

      <div className="relative z-10 w-full max-w-xl rounded-t-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] p-5 text-[var(--cryzo-text)] shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cryzo-accent)] text-white">
              <Sparkles size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight">
                Upgrade to use {modelName}
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--cryzo-muted)]">
                Cryzo&apos;s free managed models stay available on Free. Paid managed models start on Starter.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg p-2 text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {PLAN_PREVIEW.map((plan) => (
            <div
              key={plan.name}
              className="rounded-xl border border-[var(--cryzo-border)] bg-[var(--cryzo-card)] p-3"
            >
              <p className="text-sm font-semibold">{plan.name}</p>
              <p className="mt-1 text-lg font-semibold">
                {plan.price}
                <span className="text-xs font-normal text-[var(--cryzo-muted)]">/mo</span>
              </p>
              <p className="mt-1 text-[11px] leading-4 text-[var(--cryzo-muted)]">
                {plan.credits}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-10 rounded-lg border border-[var(--cryzo-border)] px-4 text-sm font-medium hover:bg-[var(--cryzo-card)]"
          >
            Keep using free models
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/chat/billing";
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--cryzo-accent)] px-4 text-sm font-semibold text-white hover:brightness-105"
          >
            View billing <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
