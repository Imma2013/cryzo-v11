"use client";

import { useMemo, useState } from "react";
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
  messageCredits: number;
  integrationCredits: number;
  features: string[];
  popular?: boolean;
};

const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    messageCredits: 25,
    integrationCredits: 100,
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
    messageCredits: 100,
    integrationCredits: 2_000,
    features: [
      "Unlimited apps",
      "Custom domains",
      "Remove Cryzo branding",
      "GitHub sync and code export",
      "Developer app connections",
    ],
  },
  {
    id: "builder",
    name: "Builder",
    monthlyPrice: 50,
    yearlyMonthlyPrice: 40,
    messageCredits: 250,
    integrationCredits: 10_000,
    popular: true,
    features: [
      "Everything in Starter",
      "Choose your AI model",
      "In-app code editing",
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
    messageCredits: 500,
    integrationCredits: 20_000,
    features: [
      "Everything in Builder",
      "More managed build capacity",
      "Priority job capacity",
      "Advanced deployment workflows",
      "Higher managed-hosting capacity",
    ],
  },
  {
    id: "elite",
    name: "Elite",
    monthlyPrice: 200,
    yearlyMonthlyPrice: 160,
    messageCredits: 1_200,
    integrationCredits: 50_000,
    features: [
      "Everything in Pro",
      "Highest managed capacity",
      "Priority support",
      "Early access to platform features",
    ],
  },
];

const PAID_PLANS = PLANS.filter(
  (plan): plan is PlanDefinition & { id: PaidPlan } => plan.id !== "free",
);

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
    <div className="min-w-0 border-t border-[var(--cryzo-border)] pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--cryzo-muted)]">
        {label}
      </p>
      <p className="mt-1 truncate text-lg font-semibold text-[var(--cryzo-text)]">
        {value}
      </p>
      <p className="mt-0.5 text-xs text-[var(--cryzo-muted)]">{detail}</p>
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
  const history = useQuery(
    api.billing.getCreditHistory,
    userId ? { userId } : "skip",
  );
  const recentHistory = useMemo(() => history?.slice(0, 8) || [], [history]);

  if (!subscription) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--cryzo-canvas)]">
        <Loader2
          className="animate-spin text-[var(--cryzo-accent)]"
          size={24}
        />
      </div>
    );
  }

  const plan = subscription.plan;
  const isPaid = plan !== "free";
  const messageTotal = Math.max(1, subscription.messageMonthlyCredits || 25);
  const messageUsed = subscription.messageCreditsUsed || 0;
  const messageRemaining = subscription.messageCreditsRemaining || 0;
  const integrationTotal = Math.max(
    1,
    subscription.integrationMonthlyCredits || 100,
  );
  const integrationUsed = subscription.integrationCreditsUsed || 0;
  const topUpPrice = (selectedTopUp / 100) * 20;

  const messageDetail =
    plan === "free"
      ? `${formatNumber(subscription.dailyCreditsRemaining || 0)} available today · ${formatNumber(messageTotal)} monthly`
      : `${formatNumber(messageUsed)} / ${formatNumber(messageTotal)} used this period`;

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
    <div className="h-full overflow-y-auto bg-[var(--cryzo-canvas)] text-[var(--cryzo-text)]">
      <div className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <header className="text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Pick a plan. Keep building.
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--cryzo-muted)] sm:text-base">
            More message credits, more integrations, and more room to ship with Cryzo.
          </p>

          <div className="mt-5 inline-flex rounded-xl border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] p-1">
            <button
              type="button"
              onClick={() => setCycle("monthly")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                cycle === "monthly"
                  ? "bg-[var(--cryzo-text)] text-[var(--cryzo-canvas)]"
                  : "text-[var(--cryzo-muted)] hover:text-[var(--cryzo-text)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setCycle("yearly")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                cycle === "yearly"
                  ? "bg-[var(--cryzo-text)] text-[var(--cryzo-canvas)]"
                  : "text-[var(--cryzo-muted)] hover:text-[var(--cryzo-text)]"
              }`}
            >
              Yearly · save 20%
            </button>
          </div>
        </header>

        {error && (
          <div className="mx-auto mt-5 flex max-w-5xl items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="rounded-md p-1 hover:bg-red-500/10"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <section className="mx-auto mt-8 grid max-w-6xl gap-4 rounded-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] p-4 sm:grid-cols-4 sm:p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.15em] text-[var(--cryzo-muted)]">
              Current plan
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-lg font-semibold">{planLabel(plan)}</span>
              <span className="rounded-full border border-[var(--cryzo-border)] px-2 py-0.5 text-[10px] text-[var(--cryzo-muted)]">
                {subscription.status}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-[var(--cryzo-muted)]">
              {plan === "free"
                ? "No card required"
                : `${subscription.billingCycle === "yearly" ? "Yearly" : "Monthly"} billing`}
            </p>
          </div>

          <UsageBlock
            label="Message credits"
            value={`${formatNumber(messageRemaining)} left`}
            detail={messageDetail}
          />

          <UsageBlock
            label="Integration credits"
            value={`${formatNumber(subscription.integrationCreditsRemaining || 0)} left`}
            detail={`${formatNumber(integrationUsed)} / ${formatNumber(integrationTotal)} used`}
          />

          <div className="flex items-end gap-2 border-t border-[var(--cryzo-border)] pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
            <button
              type="button"
              onClick={() => setTopUpOpen(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--cryzo-border)] bg-[var(--cryzo-card)] px-3 text-xs font-medium text-[var(--cryzo-text)] transition hover:brightness-95 dark:hover:brightness-110"
            >
              <Plus size={14} /> Add credits
            </button>
            {isPaid && (
              <button
                type="button"
                onClick={() => void handleManage()}
                disabled={loadingAction === "manage"}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--cryzo-border)] bg-[var(--cryzo-card)] text-[var(--cryzo-muted)] transition hover:text-[var(--cryzo-text)] disabled:opacity-50"
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

        <section className="mx-auto mt-8 max-w-6xl overflow-x-auto pb-2">
          <div className="grid min-w-[900px] grid-cols-4 gap-4">
            {PAID_PLANS.map((item) => {
              const active = plan === item.id;
              const price =
                cycle === "yearly" ? item.yearlyMonthlyPrice : item.monthlyPrice;

              return (
                <article
                  key={item.id}
                  className={`relative flex min-h-[570px] flex-col overflow-hidden rounded-xl border bg-[var(--cryzo-panel)] ${
                    item.popular
                      ? "border-[var(--cryzo-accent)]"
                      : active
                        ? "border-[var(--cryzo-text)]/50"
                        : "border-[var(--cryzo-border)]"
                  }`}
                >
                  {item.popular && (
                    <div className="bg-[var(--cryzo-accent)] py-2 text-center text-xs font-semibold tracking-wide text-white">
                      MOST POPULAR
                    </div>
                  )}

                  <div className="flex flex-1 flex-col p-6">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {item.name}
                    </h2>

                    <div className="mt-4 flex items-end gap-1">
                      <span className="text-4xl font-medium tracking-tight">
                        ${price}
                      </span>
                      <span className="pb-1 text-sm text-[var(--cryzo-muted)]">/mo</span>
                    </div>

                    {cycle === "yearly" ? (
                      <p className="mt-1 text-xs text-[var(--cryzo-muted)]">
                        Billed ${item.yearlyMonthlyPrice * 12}/year
                      </p>
                    ) : (
                      <div className="h-[17px]" />
                    )}

                    <div className="my-5 border-t border-[var(--cryzo-text)]/70" />

                    <div className="space-y-1.5 text-sm leading-5">
                      <p>
                        <strong>{formatNumber(item.messageCredits)}</strong> Message credits
                      </p>
                      <p>
                        <strong>{formatNumber(item.integrationCredits)}</strong> Integration credits
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleUpgrade(item.id)}
                      disabled={active || loadingAction === item.id}
                      className={`mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border text-sm font-medium transition disabled:opacity-50 ${
                        item.popular
                          ? "border-[var(--cryzo-accent)] bg-[var(--cryzo-accent)] text-white hover:brightness-105"
                          : "border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] text-[var(--cryzo-text)] hover:bg-[var(--cryzo-card)]"
                      }`}
                    >
                      {loadingAction === item.id && (
                        <Loader2 className="animate-spin" size={14} />
                      )}
                      {active ? "Current plan" : `Get ${item.name}`}
                    </button>

                    <div className="my-5 border-t border-[var(--cryzo-text)]/70" />

                    <div className="mb-3 text-sm font-semibold">Plan highlights:</div>
                    <div className="flex-1 space-y-3">
                      {item.features.map((feature) => (
                        <div
                          key={feature}
                          className="flex items-start gap-2 text-sm leading-5 text-[var(--cryzo-text)]"
                        >
                          <Check
                            size={14}
                            className="mt-0.5 shrink-0 text-[var(--cryzo-text)]"
                          />
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {plan === "free" && (
          <p className="mx-auto mt-4 max-w-6xl text-center text-xs text-[var(--cryzo-muted)]">
            Free includes 25 message credits per month, up to 5 per day, plus 100 integration credits.
          </p>
        )}

        {recentHistory.length > 0 && (
          <section className="mx-auto mt-8 max-w-6xl rounded-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] p-5">
            <h2 className="text-sm font-semibold">Recent credit activity</h2>
            <div className="mt-3 divide-y divide-[var(--cryzo-border)]">
              {recentHistory.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between gap-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[var(--cryzo-text)]">
                      {entry.description || entry.reason}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--cryzo-muted)]">
                      {new Date(entry.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <span
                    className={
                      entry.amount > 0
                        ? "text-emerald-500"
                        : "text-[var(--cryzo-muted)]"
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
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setTopUpOpen(false)}
            aria-label="Close"
          />
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-[var(--cryzo-border)] bg-[var(--cryzo-panel)] p-5 text-[var(--cryzo-text)] shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add message credits</h2>
                <p className="mt-1 text-sm text-[var(--cryzo-muted)]">
                  BYOK models use your provider balance instead of Cryzo message credits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTopUpOpen(false)}
                className="rounded-lg p-2 text-[var(--cryzo-muted)] hover:bg-[var(--cryzo-card)] hover:text-[var(--cryzo-text)]"
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
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    selectedTopUp === option.credits
                      ? "border-[var(--cryzo-accent)] bg-[var(--cryzo-accent)] text-white"
                      : "border-[var(--cryzo-border)] bg-[var(--cryzo-card)] text-[var(--cryzo-text)] hover:border-[var(--cryzo-muted)]"
                  }`}
                >
                  <span className="block text-sm font-semibold">
                    {option.credits} credits
                  </span>
                  <span
                    className={`mt-1 block text-xs ${
                      selectedTopUp === option.credits
                        ? "text-white/75"
                        : "text-[var(--cryzo-muted)]"
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
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--cryzo-accent)] text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-50"
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
