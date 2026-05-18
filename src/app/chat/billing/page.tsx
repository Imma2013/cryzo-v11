"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Loader2,
  Plus,
  Sparkles,
  Zap,
} from "lucide-react";

const TOP_UP_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const credits = (index + 1) * 100;
  return { credits, price: (credits / 100) * 20 };
});

function formatCredits(value: number | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function money(cents: number) {
  return `$${Math.round(cents / 100).toLocaleString()}`;
}

export default function BillingPage() {
  const { userId, user } = useAuth();
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [selectedTopUp, setSelectedTopUp] = useState(100);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const subscription = useQuery(
    api.billing.getSubscription,
    userId ? { userId } : "skip",
  );

  const history = useQuery(
    api.billing.getCreditHistory,
    userId ? { userId } : "skip",
  );

  if (!subscription) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  const plan = subscription.plan;
  const isPaid = plan === "pro" || plan === "pro_plus";
  const totalCredits = Math.max(
    1,
    subscription.billingCreditsTotal || subscription.monthlyCredits || 30,
  );
  const usedPercent = Math.min(
    100,
    Math.max(0, ((subscription.creditsUsed ?? 0) / totalCredits) * 100),
  );
  const remainingPercent = Math.min(
    100 - usedPercent,
    Math.max(0, ((subscription.creditsRemaining ?? 0) / totalCredits) * 100),
  );
  const topUpPrice = (selectedTopUp / 100) * 20;

  const handleUpgrade = async (targetPlan: "pro" | "pro_plus") => {
    if (!userId) return;
    setLoadingAction(targetPlan);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: targetPlan,
          userId,
          email: user?.email,
        }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTopUp = async () => {
    if (!userId) return;
    setLoadingAction("topup");
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, credits: selectedTopUp }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManage = async () => {
    if (!userId) return;
    setLoadingAction("manage");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-black px-5 py-6 text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-blue-400">
              Plans & credits
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Billing
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Credits are used across chat, Plan mode, Build mode, tool actions,
              integrations, and code generation.
            </p>
          </div>
          {isPaid && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTopUpOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
              >
                <Plus size={16} />
                Add credits
              </button>
              <button
                type="button"
                onClick={handleManage}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white"
              >
                <CreditCard size={16} />
                Manage
              </button>
            </div>
          )}
        </div>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-300">
                  {plan === "pro_plus" ? "Pro+" : plan === "pro" ? "Pro" : "Free"}
                </span>
                <span className="text-xs text-zinc-500">
                  {subscription.status}
                </span>
              </div>
              <p className="mt-3 text-2xl font-semibold">
                {formatCredits(subscription.creditsRemaining)} credits left
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {plan === "free"
                  ? `${formatCredits(subscription.dailyCreditsRemaining)} daily credits and ${formatCredits(subscription.freeMonthlyRemaining)} free monthly credits available`
                  : `${formatCredits(subscription.monthlyCredits)} monthly credits${subscription.rolloverCredits ? `, ${formatCredits(subscription.rolloverCredits)} rollover` : ""}${subscription.topUpCredits ? `, ${formatCredits(subscription.topUpCredits)} top-up` : ""}`}
              </p>
            </div>

            <div className="w-full lg:max-w-md">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>{formatCredits(subscription.creditsUsed)} used</span>
                <span>{formatCredits(totalCredits)} total</span>
              </div>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="bg-zinc-600"
                  style={{ width: `${usedPercent}%` }}
                />
                <div
                  className="bg-blue-500"
                  style={{ width: `${remainingPercent}%` }}
                />
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-zinc-400">
                  Used
                </span>
                <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-300">
                  Available
                </span>
                {subscription.topUpCredits > 0 && (
                  <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-sky-300">
                    Top-up expires in 12 months
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <PlanCard
            icon={<Zap size={18} />}
            title="Free"
            price="$0"
            cadence="/mo"
            credits="10 daily credits, max 30/month"
            features={["Private projects", "Chat workspace", "Community support"]}
            active={plan === "free"}
          />
          <PlanCard
            icon={<Sparkles size={18} />}
            title="Pro"
            price="$20"
            cadence="/mo"
            credits="100 credits / month"
            features={[
              "Higher monthly usage",
              "100-credit top-ups",
              "Custom domains ready",
            ]}
            active={plan === "pro"}
            action={
              <button
                type="button"
                onClick={() => handleUpgrade("pro")}
                disabled={loadingAction === "pro" || plan === "pro"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAction === "pro" && <Loader2 className="animate-spin" size={15} />}
                {plan === "pro" ? "Current plan" : "Upgrade"}
              </button>
            }
          />
          <PlanCard
            icon={<CreditCard size={18} />}
            title="Pro+"
            price="$50"
            cadence="/mo"
            credits="250 credits / month"
            features={[
              "More monthly credits",
              "Team-ready billing",
              "Priority workspace capacity",
            ]}
            active={plan === "pro_plus"}
            action={
              <button
                type="button"
                onClick={() => handleUpgrade("pro_plus")}
                disabled={loadingAction === "pro_plus" || plan === "pro_plus"}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/60 px-4 py-2.5 text-sm font-medium text-blue-200 transition-colors hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAction === "pro_plus" && <Loader2 className="animate-spin" size={15} />}
                {plan === "pro_plus" ? "Current plan" : "Upgrade"}
              </button>
            }
          />
        </section>

        <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Credit top-ups</p>
              <p className="mt-1 text-sm text-zinc-400">
                Paid plans can add credits in 100-credit increments. Top-up
                credits expire 12 months after purchase.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              disabled={!isPaid}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              <Plus size={16} />
              Add credits
            </button>
          </div>
        </section>

        {history && history.length > 0 && (
          <section className="rounded-lg border border-zinc-800 bg-zinc-950 p-5">
            <p className="text-sm font-medium">Recent activity</p>
            <div className="mt-4 divide-y divide-zinc-900">
              {history.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div>
                    <p className="text-zinc-200">
                      {entry.description || entry.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={
                      entry.amount > 0 ? "text-green-400" : "text-zinc-400"
                    }
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {formatCredits(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {topUpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-zinc-800 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add credits</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Choose a 100-credit increment. Credits are added after Stripe
                  confirms payment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTopUpOpen(false)}
                className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-900 hover:text-white"
              >
                x
              </button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              {TOP_UP_OPTIONS.map((option) => (
                <button
                  key={option.credits}
                  type="button"
                  onClick={() => setSelectedTopUp(option.credits)}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    selectedTopUp === option.credits
                      ? "border-blue-500 bg-blue-500/10 text-white"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  <span className="block text-sm font-medium">
                    {option.credits} credits
                  </span>
                  <span className="mt-1 block text-xs text-zinc-500">
                    ${option.price}
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={handleTopUp}
              disabled={loadingAction === "topup"}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAction === "topup" ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <ArrowUpRight size={15} />
              )}
              Continue to checkout - {selectedTopUp} credits for ${topUpPrice}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanCard({
  icon,
  title,
  price,
  cadence,
  credits,
  features,
  active,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  price: string;
  cadence: string;
  credits: string;
  features: string[];
  active?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        active
          ? "border-blue-500/50 bg-blue-500/5"
          : "border-zinc-800 bg-zinc-950"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-zinc-200">
          <span className="text-blue-300">{icon}</span>
          <h3 className="font-medium">{title}</h3>
        </div>
        {active && (
          <span className="rounded-full bg-blue-500/10 px-2 py-1 text-xs text-blue-300">
            Current
          </span>
        )}
      </div>
      <div className="mt-5">
        <span className="text-3xl font-semibold">{price}</span>
        <span className="text-sm text-zinc-500">{cadence}</span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{credits}</p>
      <div className="mt-5 space-y-2">
        {features.map((feature) => (
          <div key={feature} className="flex items-center gap-2 text-sm text-zinc-300">
            <Check size={14} className="text-blue-400" />
            <span>{feature}</span>
          </div>
        ))}
      </div>
      {action}
    </div>
  );
}
