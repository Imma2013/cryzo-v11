"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useAuthToken } from "@convex-dev/auth/react";
import { api } from "../../../../convex/_generated/api";
import { useAuth } from "@/providers/AuthProvider";
import {
  ArrowUpRight,
  Bot,
  Check,
  CreditCard,
  Gauge,
  Globe2,
  Loader2,
  Plus,
  Rocket,
  Smartphone,
  Sparkles,
  Wrench,
  X,
  Zap,
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
  tagline: string;
  features: string[];
  emphasis?: boolean;
  icon: React.ReactNode;
};

const PLANS: PlanDefinition[] = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    messageCredits: 25,
    integrationCredits: 100,
    tagline: "Build without counting projects.",
    features: [
      "Unlimited projects",
      "5 free generations daily, 25 monthly",
      "Bring your own AI keys",
      "1 social account, 10 publish-now posts monthly",
      "GitHub sync and code export",
      "Deploy with your own Vercel or Netlify",
      "Native mobile source and store-readiness scans",
    ],
    icon: <Zap size={17} />,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 20,
    yearlyMonthlyPrice: 16,
    messageCredits: 100,
    integrationCredits: 2_000,
    tagline: "More managed AI and connected actions.",
    features: [
      "Everything in Free",
      "$10 managed AI spend included",
      "2,000 integration credits",
      "Remove Cryzo branding on managed hosting",
      "Managed custom domains",
      "7 social accounts and post scheduling",
    ],
    icon: <Sparkles size={17} />,
  },
  {
    id: "builder",
    name: "Builder",
    monthlyPrice: 50,
    yearlyMonthlyPrice: 40,
    messageCredits: 250,
    integrationCredits: 10_000,
    tagline: "Ship web and native apps with Cryzo handling the boring parts.",
    features: [
      "Everything in Starter",
      "$25 managed AI spend included",
      "10,000 integration credits",
      "Managed iOS and Android builds",
      "App Store and Google Play submission",
      "Higher managed-hosting capacity",
    ],
    emphasis: true,
    icon: <Rocket size={17} />,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 100,
    yearlyMonthlyPrice: 80,
    messageCredits: 500,
    integrationCredits: 20_000,
    tagline: "For builders running larger products and workflows.",
    features: [
      "Everything in Builder",
      "$50 managed AI spend included",
      "20,000 integration credits",
      "More managed build capacity",
      "Priority job capacity",
      "Advanced deployment workflows",
    ],
    icon: <Gauge size={17} />,
  },
  {
    id: "elite",
    name: "Elite",
    monthlyPrice: 200,
    yearlyMonthlyPrice: 160,
    messageCredits: 1_200,
    integrationCredits: 50_000,
    tagline: "Top credits and support for people going all in.",
    features: [
      "Everything in Pro",
      "$100 managed AI spend included",
      "50,000 integration credits",
      "Highest managed capacity",
      "Priority support",
      "Early access to platform features",
    ],
    icon: <CreditCard size={17} />,
  },
];

function formatCredits(value: number | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

function percent(used: number, total: number) {
  if (!total) return 0;
  return Math.min(100, Math.max(0, (used / total) * 100));
}

function planLabel(plan: string) {
  const match = PLANS.find((item) => item.id === plan);
  return match?.name || plan.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
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

  const recentHistory = useMemo(() => history?.slice(0, 16) || [], [history]);

  if (!subscription || !aiBalance) {
    return (
      <div className="flex h-full items-center justify-center bg-black">
        <Loader2 className="animate-spin text-zinc-500" size={24} />
      </div>
    );
  }

  const plan = subscription.plan;
  const isPaid = plan !== "free";
  const messageTotal = plan === "free" ? 25 : aiBalance.allowanceMicros / 1_000_000;
  const integrationTotal = Math.max(1, subscription.integrationMonthlyCredits || 100);
  const messageUsed = plan === "free" ? 25 - aiBalance.freeRemaining : aiBalance.spentMicros / 1_000_000;
  const integrationUsed = subscription.integrationCreditsUsed || 0;
  const topUpPrice = (selectedTopUp / 100) * 20;

  const handleUpgrade = async (targetPlan: PaidPlan) => {
    if (!userId) return;
    setError(null);
    setLoadingAction(targetPlan);
    try {
      const res = await fetch("/api/billing/checkout", {
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to start checkout");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start checkout");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTopUp = async () => {
    if (!userId) return;
    setError(null);
    setLoadingAction("topup");
    try {
      const res = await fetch("/api/billing/topup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ userId, credits: selectedTopUp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to start top-up checkout");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to start top-up checkout");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleManage = async () => {
    if (!userId) return;
    setError(null);
    setLoadingAction("manage");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to open billing portal");
      if (data.url) window.location.href = data.url;
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to open billing portal");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-black px-4 py-6 text-white sm:px-6">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-16">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
              <Sparkles size={13} /> Cryzo plans
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Build freely. Pay for managed power.</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Projects, BYOK models, source export and DIY deployments are not the meter. Managed AI uses an included dollar allowance at reported provider cost. Integration credits for connected actions are separate. No automatic overage charges.
            </p>
          </div>
          {isPaid && (
            <div className="flex gap-2">

              <button type="button" onClick={() => void handleManage()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-800 px-4 text-sm text-zinc-300 hover:border-zinc-600 hover:text-white">
                {loadingAction === "manage" ? <Loader2 className="animate-spin" size={15} /> : <CreditCard size={15} />} Manage
              </button>
            </div>
          )}
        </header>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} className="rounded-md p-1 hover:bg-red-950"><X size={14} /></button>
          </div>
        )}

        <section className="grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-zinc-600">Current plan</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-2xl font-semibold">{planLabel(plan)}</span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">{subscription.status}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-black p-3"><Rocket size={20} /></div>
            </div>
            <p className="mt-5 text-sm text-zinc-400">
              {plan === "free"
                ? `${aiBalance.dailyRemaining} free generations available today, ${aiBalance.freeRemaining} left this month.`
                : `${subscription.billingCycle === "yearly" ? "Yearly" : "Monthly"} billing · renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}.`}
            </p>
          </div>

          <MeterCard
            icon={<Bot size={17} />}
            title={plan === "free" ? "Free generations" : "Managed AI allowance"}
            dollars={plan !== "free"}
            remaining={plan === "free" ? aiBalance.freeRemaining : aiBalance.remainingMicros / 1_000_000}
            used={messageUsed}
            total={messageTotal}
            note="Exact reported cost, including reasoning. Failed, empty and cancelled generations are not charged. Allowance resets monthly (UTC)."
          />

          <MeterCard
            icon={<Wrench size={17} />}
            title="Integration credits"
            remaining={subscription.integrationCreditsRemaining || 0}
            used={integrationUsed}
            total={integrationTotal}
            note="Used by connected actions such as Composio tools. Connecting an account is free."
          />
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <RuleCard icon={<Zap size={17} />} title="Managed models" text="Model costs follow reported input, output and reasoning usage, not arbitrary credit multipliers." />
          <RuleCard icon={<Bot size={17} />} title="Bring your own key" text="No Cryzo AI allowance is spent. Your own provider bills you directly." />
          <RuleCard icon={<Globe2 size={17} />} title="Unlimited projects" text="Build, export, sync to GitHub and DIY-deploy as many projects as you want." />
        </section>

        <section>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-zinc-600">Plans from first idea to full scale</p>
              <h2 className="mt-1 text-2xl font-semibold">Choose managed capacity</h2>
            </div>
            <div className="inline-flex w-fit rounded-xl border border-zinc-800 bg-zinc-950 p-1">
              <button type="button" onClick={() => setCycle("monthly")} className={`rounded-lg px-4 py-2 text-sm font-medium ${cycle === "monthly" ? "bg-white text-black" : "text-zinc-500 hover:text-white"}`}>
                Monthly
              </button>
              <button type="button" onClick={() => setCycle("yearly")} className={`rounded-lg px-4 py-2 text-sm font-medium ${cycle === "yearly" ? "bg-white text-black" : "text-zinc-500 hover:text-white"}`}>
                Yearly <span className="ml-1 text-[11px] opacity-60">save 20%</span>
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {PLANS.map((item) => {
              const active = plan === item.id;
              const price = cycle === "yearly" ? item.yearlyMonthlyPrice : item.monthlyPrice;
              return (
                <div key={item.id} className={`relative flex min-h-[560px] flex-col rounded-2xl border p-5 ${item.emphasis ? "border-violet-700/70 bg-violet-950/10" : active ? "border-zinc-500 bg-zinc-900/60" : "border-zinc-800 bg-zinc-950"}`}>
                  {item.emphasis && <span className="absolute right-4 top-4 rounded-full bg-violet-500 px-2.5 py-1 text-[10px] font-semibold text-white">Popular</span>}
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-800 bg-black text-zinc-300">{item.icon}</div>
                  <h3 className="mt-5 text-2xl font-semibold">{item.name}</h3>
                  <p className="mt-2 min-h-12 text-sm leading-5 text-zinc-500">{item.tagline}</p>
                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-semibold tracking-tight">${price}</span>
                    <span className="pb-1 text-sm text-zinc-600">/mo</span>
                  </div>
                  {cycle === "yearly" && item.id !== "free" ? (
                    <p className="mt-1 text-xs text-zinc-600">Billed ${item.yearlyMonthlyPrice * 12}/year</p>
                  ) : <div className="h-5" />}

                  <div className="my-5 border-t border-zinc-800" />
                  <div className="space-y-2 text-sm">
                    <div><strong>{item.id === "free" ? "25 generations" : "$" + item.monthlyPrice / 2}</strong> <span className="text-zinc-500">{item.id === "free" ? "/ month, max 5 daily" : "AI allowance / month"}</span></div>
                    <div><strong>{formatCredits(item.integrationCredits)}</strong> <span className="text-zinc-500">integration credits /mo</span></div>
                  </div>
                  <div className="my-5 border-t border-zinc-800" />
                  <div className="flex-1 space-y-3">
                    {item.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-sm leading-5 text-zinc-300">
                        <Check size={14} className="mt-0.5 shrink-0 text-zinc-500" /> <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {item.id === "free" ? (
                    <button type="button" disabled className="mt-6 h-11 w-full rounded-xl border border-zinc-800 text-sm font-medium text-zinc-500 disabled:cursor-default">
                      {active ? "Current plan" : "Included"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleUpgrade(item.id as PaidPlan)}
                      disabled={active || loadingAction === item.id}
                      className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:cursor-default disabled:opacity-50 ${item.emphasis ? "bg-violet-500 text-white hover:bg-violet-400" : "bg-white text-black hover:bg-zinc-200"}`}
                    >
                      {loadingAction === item.id && <Loader2 className="animate-spin" size={14} />}
                      {active ? "Current plan" : `Choose ${item.name}`}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium"><Plus size={15} /> No surprise bills</div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">When your AI allowance runs out, choose a higher plan or bring your own key. We do not silently downgrade your model or charge automatic overages.</p>
              </div>

            </div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Smartphone size={15} /> Shipping mobile apps</div>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Store-readiness scans and native source stay available without a paid plan. Builder and above add Cryzo-managed EAS build and App Store / Google Play submission workflows.</p>
          </div>
        </section>

        {recentHistory.length > 0 && (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Recent credit activity</p>
                <p className="mt-1 text-xs text-zinc-600">Message and integration meters stay separate.</p>
              </div>
            </div>
            <div className="mt-4 divide-y divide-zinc-900">
              {recentHistory.map((entry) => (
                <div key={entry._id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-zinc-200">{entry.description || entry.reason}</p>
                      <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[9px] uppercase tracking-wide text-zinc-500">{entry.creditType || "message"}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-600">{new Date(entry.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={entry.amount > 0 ? "text-emerald-400" : "text-zinc-400"}>{entry.amount > 0 ? "+" : ""}{formatCredits(entry.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {topUpOpen && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <button className="absolute inset-0" onClick={() => setTopUpOpen(false)} aria-label="Close" />
          <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Add message credits</h2>
                <p className="mt-1 text-sm text-zinc-500">For Cryzo-managed AI. BYOK models use zero Cryzo message credits.</p>
              </div>
              <button type="button" onClick={() => setTopUpOpen(false)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-900 hover:text-white"><X size={16} /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TOP_UP_OPTIONS.map((option) => (
                <button key={option.credits} type="button" onClick={() => setSelectedTopUp(option.credits)} className={`rounded-xl border px-3 py-3 text-left ${selectedTopUp === option.credits ? "border-white bg-white text-black" : "border-zinc-800 bg-black text-zinc-300 hover:border-zinc-600"}`}>
                  <span className="block text-sm font-semibold">{option.credits} credits</span>
                  <span className={`mt-1 block text-xs ${selectedTopUp === option.credits ? "text-zinc-500" : "text-zinc-600"}`}>${option.price}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void handleTopUp()} disabled={loadingAction === "topup"} className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-50">
              {loadingAction === "topup" ? <Loader2 className="animate-spin" size={15} /> : <ArrowUpRight size={15} />}
              Continue · {selectedTopUp} credits for ${topUpPrice}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeterCard({
  icon,
  title,
  remaining,
  used,
  total,
  note,
  dollars = false,
}: {
  icon: React.ReactNode;
  title: string;
  remaining: number;
  used: number;
  total: number;
  note: string;
  dollars?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">{icon} {title}</div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="text-2xl font-semibold">{dollars ? "$" + remaining.toFixed(2) : formatCredits(remaining)} <span className="text-sm font-normal text-zinc-600">left</span></p>
        <span className="text-xs text-zinc-600">{dollars ? "$" + used.toFixed(2) : formatCredits(used)} / {dollars ? "$" + total.toFixed(2) : formatCredits(total)} used</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-900">
        <div className="h-full rounded-full bg-white" style={{ width: `${percent(used, total)}%` }} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-600">{note}</p>
    </div>
  );
}

function RuleCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">{icon} {title}</div>
      <p className="mt-2 text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}
