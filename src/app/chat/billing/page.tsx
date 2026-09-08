"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import {
  ArrowUpRight,
  Check,
  CreditCard,
  Loader2,
  Plus,
  X,
} from "lucide-react";

const TOP_UP_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const credits = (index + 1) * 100;
  return { credits, price: (credits / 100) * 20 };
});

type PaidPlan = "starter" | "builder" | "pro" | "elite";
type BillingCycle = "monthly" | "yearly";

type PlanDefinition = {
  id: "free" | PaidPlan;
  name: string;
  monthlyPrice: number;
  yearlyMonthlyPrice: number;
  integrationCredits: number;
  tagline: string;
  aiAllowance: string;
  features: string[];
  popular?: boolean;
};

const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    integrationCredits: 100,
    tagline: "All of Cryzo's core builder features, free.",
    aiAllowance: "25 free generations /mo",
    features: [
      "Core Cryzo builder features",
      "Unlimited projects",
      "Bring your own AI keys",
      "GitHub sync and code export",
      "Deploy with your own Vercel or Netlify",
      "Native mobile source and store-readiness scans",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 20,
    yearlyMonthlyPrice: 16,
    integrationCredits: 2_000,
    tagline: "Build your first serious apps with managed AI and hosting.",
    aiAllowance: "$10 AI allowance /mo",
    features: [
      "Everything in Free",
      "$10 managed AI spend included",
      "Remove Cryzo branding on managed hosting",
      "Managed custom domains",
      "Developer app connections",
    ],
  },
  {
    id: "builder",
    name: "Builder",
    monthlyPrice: 50,
    yearlyMonthlyPrice: 40,
    integrationCredits: 10_000,
    tagline: "More room to build and ship web plus native apps.",
    aiAllowance: "$25 AI allowance /mo",
    popular: true,
    features: [
      "Everything in Starter",
      "$25 managed AI spend included",
      "Managed iOS and Android builds",
      "App Store and Google Play submission",
      "Higher managed-hosting capacity",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 100,
    yearlyMonthlyPrice: 80,
    integrationCredits: 20_000,
    tagline: "Advanced tools and capacity for larger products.",
    aiAllowance: "$50 AI allowance /mo",
    features: [
      "Everything in Builder",
      "$50 managed AI spend included",
      "More managed build capacity",
      "Priority job capacity",
      "Advanced deployment workflows",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    monthlyPrice: 200,
    yearlyMonthlyPrice: 160,
    integrationCredits: 50_000,
    tagline: "Top credits and support for builders going all in.",
    aiAllowance: "$100 AI allowance /mo",
    features: [
      "Everything in Pro",
      "$100 managed AI spend included",
      "Highest managed capacity",
      "Priority support",
      "Early access to platform features",
    ],
  },
];

function formatNumber(value: number | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function planLabel(plan: string) {
  return (
    PLANS.find((item) => item.id === plan)?.name ||
    plan.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function UsageBlock({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0 border-t border-zinc-800 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

export default function BillingPage() {
  const { userId, user } = useAuth();
  const authToken = useAuthToken();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [selectedTopUp, setSelectedTopUp] = useState(100);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscription = useQuery(
    api.billing.getSubscription,
    userId ? { userId } : "skip",
  );
  const aiBalance = useQuery(api.aiUsage.balance, userId ? {} : "skip");
  const history = useQuery(
    api.billing.getCreditHistory,
    userId ? { userId } : "skip",
  );
  const recentHistory = useMemo(() => history?.slice(0, 8) || [], [history]);

  if (!subscription || !aiBalance) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  const plan = subscription.plan;
  const isPaid = plan !== "free";
  const integrationTotal = Math.max(
    1,
    subscription.integrationMonthlyCredits || 100,
  );
  const integrationUsed = subscription.integrationCreditsUsed || 0;
  const topUpPrice = (selectedTopUp / 100) * 20;
  const aiRemaining =
    plan === "free"
      ? `${aiBalance.freeRemaining} generations left`
      : `$${((aiBalance.remainingMicros || 0) / 1_000_000).toFixed(2)} left`;
  const aiDetail =
    plan === "free"
      ? `${aiBalance.dailyRemaining} available today`
      : `$${((aiBalance.spentMicros || 0) / 1_000_000).toFixed(2)} used this period`;

  const handleUpgrade = async (targetPlan: PaidPlan) => {
    if (!userId) return;
    setError(null);
    setLoadingAction(targetPlan);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          plan: targetPlan,
          billingCycle: cycle,
          userId,
          email: user?.email,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start checkout");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start checkout",
      );
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTopUp = async () => {
    if (!userId) return;
    setError(null);
    setLoadingAction("topup");
    try {
      const response = await fetch("/api/billing/topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ userId, credits: selectedTopUp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to start top-up checkout");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to start top-up checkout",
      );
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManage = async () => {
    if (!userId) return;
    setError(null);
    setLoadingAction("manage");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to open billing portal",
      );
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-black text-white">
      <div className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-6 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-zinc-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Plans & billing</h1>
            <p className="mt-1.5 text-sm text-zinc-500">
              Choose the amount of managed AI, integrations, hosting and mobile shipping you need.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1">
              <button
                type="button"
                onClick={() => setCycle("monthly")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  cycle === "monthly"
                    ? "bg-white text-black"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setCycle("yearly")}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  cycle === "yearly"
                    ? "bg-white text-black"
                    : "text-zinc-500 hover:text-white"
                }`}
              >
                Yearly · save 20%
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-md p-1 hover:bg-red-950"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <section className="mt-5 grid gap-4 rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-4 sm:grid-cols-4 sm:p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-zinc-600">Current plan</p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-semibold">{planLabel(plan)}</span>
              <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                {subscription.status}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {plan === "free"
                ? "No card required"
                : `${subscription.billingCycle === "yearly" ? "Yearly" : "Monthly"} billing`}
            </p>
          </div>
          <UsageBlock label="Managed AI" value={aiRemaining} detail={aiDetail} />
          <UsageBlock
            label="Integration credits"
            value={`${formatNumber(subscription.integrationCreditsRemaining || 0)} left`}
            detail={`${formatNumber(integrationUsed)} / ${formatNumber(integrationTotal)} used`}
          />
          <div className="flex items-end gap-2 border-t border-zinc-800 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 px-3 text-xs font-medium text-zinc-200 hover:border-zinc-500"
            >
              <Plus size={14} /> Add AI credits
            </button>
            {isPaid && (
              <button
                type="button"
                onClick={() => void handleManage()}
                disabled={loadingAction === "manage"}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 disabled:opacity-50"
                title="Manage subscription"
              >
                {loadingAction === "manage" ? (
                  <Loader2 className="animate-spin" size={14} />
                ) : (
                  <CreditCard size={14} />
                )}
              </button>
            )}
          </div>
        </section>

        <section className="mt-6 overflow-x-auto pb-2">
          <div className="grid min-w-[1120px] grid-cols-5 gap-3">
            {PLANS.map((item) => {
              const active = plan === item.id;
              const price =
                cycle === "yearly" ? item.yearlyMonthlyPrice : item.monthlyPrice;
              return (
                <article
                  key={item.id}
                  className={`relative flex min-h-[610px] flex-col border bg-[#080808] p-5 ${
                    item.popular
                      ? "border-violet-600"
                      : active
                        ? "border-zinc-500"
                        : "border-zinc-800"
                  }`}
                >
                  {item.popular && (
                    <span className="absolute right-4 top-4 rounded bg-violet-600 px-2.5 py-1 text-[10px] font-semibold text-white">
                      Popular
                    </span>
                  )}

                  <h2 className="text-2xl font-semibold">{item.name}</h2>
                  <p className="mt-3 min-h-[58px] text-sm leading-5 text-zinc-400">
                    {item.tagline}
                  </p>

                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-5xl font-medium tracking-tight">${price}</span>
                    <span className="pb-1.5 text-sm text-zinc-600">/mo</span>
                  </div>
                  {cycle === "yearly" && item.id !== "free" ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      Billed ${item.yearlyMonthlyPrice * 12}/year
                    </p>
                  ) : (
                    <div className="h-5" />
                  )}

                  <div className="my-5 border-t-2 border-zinc-700" />
                  <div className="space-y-2 text-sm">
                    <p>
                      <strong>{item.aiAllowance}</strong>
                    </p>
                    <p>
                      <strong>{formatNumber(item.integrationCredits)}</strong>{" "}
                      <span className="text-zinc-500">integration credits /mo</span>
                    </p>
                  </div>
                  <div className="my-5 border-t-2 border-zinc-700" />

                  <div className="mb-3 text-sm font-semibold">Plan highlights:</div>
                  <div className="flex-1 space-y-3">
                    {item.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-2 text-sm leading-5 text-zinc-300"
                      >
                        <Check size={14} className="mt-0.5 shrink-0 text-zinc-400" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {item.id === "free" ? (
                    <button
                      type="button"
                      disabled
                      className="mt-6 h-11 w-full rounded-lg border border-zinc-800 text-sm font-semibold text-zinc-500"
                    >
                      {active ? "Current plan" : "Included"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUpgrade(item.id as PaidPlan)}
                      disabled={active || loadingAction === item.id}
                      className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold disabled:opacity-50 ${
                        item.popular
                          ? "bg-violet-600 text-white hover:bg-violet-500"
                          : "bg-white text-black hover:bg-zinc-200"
                      }`}
                    >
                      {loadingAction === item.id && (
                        <Loader2 className="animate-spin" size={14} />
                      )}
                      {active ? "Current plan" : `Choose ${item.name}`}
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {recentHistory.length > 0 && (
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-[#0b0b0b] p-5">
            <h2 className="text-sm font-semibold">Recent credit activity</h2>
            <div className="mt-3 divide-y divide-zinc-900">
              {recentHistory.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-zinc-300">
                      {entry.description || entry.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={
                      entry.amount > 0 ? "text-emerald-400" : "text-zinc-400"
                    }
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {formatNumber(entry.amount)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {topUpOpen && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setTopUpOpen(false)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add managed AI credits</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  BYOK models use your provider balance instead of Cryzo credits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTopUpOpen(false)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TOP_UP_OPTIONS.map((option) => (
                <button
                  key={option.credits}
                  type="button"
                  onClick={() => setSelectedTopUp(option.credits)}
                  className={`rounded-xl border px-3 py-3 text-left ${
                    selectedTopUp === option.credits
                      ? "border-white bg-white text-black"
                      : "border-zinc-800 bg-black text-zinc-300 hover:border-zinc-600"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {option.credits} credits
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      selectedTopUp === option.credits
                        ? "text-zinc-500"
                        : "text-zinc-600"
                    }`}
                  >
                    ${option.price}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleTopUp()}
              disabled={loadingAction === "topup"}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white text-sm font-semibold text-black disabled:opacity-50"
            >
              {loadingAction === "topup" ? (
                <Loader2 className="animate-spin" size={15} />
              ) : (
                <ArrowUpRight size={15} />
              )}
              Continue · {selectedTopUp} credits for ${topUpPrice}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FeatureLine({ children }: { children: ReactNode }) {
  return <div className="text-sm text-zinc-300">{children}</div>;
}

void FeatureLine;
