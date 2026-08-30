import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: "2026-04-22.dahlia",
  });
  return stripeClient;
}

const SHARED_TOPUP_PRICE_ID =
  process.env.STRIPE_TOPUP_100_PRICE_ID ??
  process.env.STRIPE_TOPUP_PRO_PRICE_ID ??
  process.env.STRIPE_TOPUP_BUSINESS_PRICE_ID ??
  "";

export const PLANS = {
  starter: {
    name: "Starter",
    monthlyPrice: 2000,
    annualPrice: 19200,
    annualMonthlyEquivalent: 1600,
    messageCredits: 100,
    integrationCredits: 2_000,
    monthlyPriceId:
      process.env.STRIPE_STARTER_PRICE_ID ?? process.env.STRIPE_PRO_PRICE_ID ?? "",
    annualPriceId: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID ?? "",
    topupPriceId: SHARED_TOPUP_PRICE_ID,
    topupPrice: 2000,
    topupCredits: 100,
  },
  builder: {
    name: "Builder",
    monthlyPrice: 5000,
    annualPrice: 48000,
    annualMonthlyEquivalent: 4000,
    messageCredits: 250,
    integrationCredits: 10_000,
    monthlyPriceId:
      process.env.STRIPE_BUILDER_PRICE_ID ??
      process.env.STRIPE_PRO_PLUS_PRICE_ID ??
      process.env.STRIPE_BUSINESS_PRICE_ID ??
      "",
    annualPriceId: process.env.STRIPE_BUILDER_ANNUAL_PRICE_ID ?? "",
    topupPriceId: SHARED_TOPUP_PRICE_ID,
    topupPrice: 2000,
    topupCredits: 100,
  },
  pro: {
    name: "Pro",
    monthlyPrice: 10000,
    annualPrice: 96000,
    annualMonthlyEquivalent: 8000,
    messageCredits: 500,
    integrationCredits: 20_000,
    // Deliberately do NOT fall back to the old STRIPE_PRO_PRICE_ID because that
    // price represented the previous $20/100-credit plan, now Starter.
    monthlyPriceId: process.env.STRIPE_PRO_100_PRICE_ID ?? "",
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID ?? "",
    topupPriceId: SHARED_TOPUP_PRICE_ID,
    topupPrice: 2000,
    topupCredits: 100,
  },
  elite: {
    name: "Elite",
    monthlyPrice: 20000,
    annualPrice: 192000,
    annualMonthlyEquivalent: 16000,
    messageCredits: 1_200,
    integrationCredits: 50_000,
    monthlyPriceId: process.env.STRIPE_ELITE_PRICE_ID ?? "",
    annualPriceId: process.env.STRIPE_ELITE_ANNUAL_PRICE_ID ?? "",
    topupPriceId: SHARED_TOPUP_PRICE_ID,
    topupPrice: 2000,
    topupCredits: 100,
  },
} as const;

export type PaidPlan = keyof typeof PLANS;
export type BillingCycle = "monthly" | "yearly";

export const TOP_UP_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const credits = (index + 1) * 100;
  return {
    credits,
    price: (credits / 100) * 2000,
  };
});

export function isPaidPlan(plan: string): plan is PaidPlan {
  return plan === "starter" || plan === "builder" || plan === "pro" || plan === "elite";
}

export function priceIdFor(plan: PaidPlan, cycle: BillingCycle) {
  const config = PLANS[plan];
  return cycle === "yearly" ? config.annualPriceId : config.monthlyPriceId;
}

export function resolvePlanFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return undefined;

  for (const [plan, config] of Object.entries(PLANS)) {
    if (config.monthlyPriceId === priceId || config.annualPriceId === priceId) {
      return plan as PaidPlan;
    }
  }

  return undefined;
}

export function resolveBillingCycleFromPriceId(
  priceId: string | null | undefined,
): BillingCycle | undefined {
  if (!priceId) return undefined;
  for (const config of Object.values(PLANS)) {
    if (config.annualPriceId === priceId) return "yearly";
    if (config.monthlyPriceId === priceId) return "monthly";
  }
  return undefined;
}

type CreditCostInput = {
  text: string;
  mode?: "build" | "plan";
  hasFiles?: boolean;
};

const SIMPLE_TWEAK_PATTERN =
  /\b(make|change|update|fix|remove|rename|move|resize|color|copy|text|button|footer|header|spacing|padding|margin)\b/i;
const FEATURE_PATTERN =
  /\b(auth|login|sign in|sign up|payment|billing|stripe|database|convex|firebase|api|webhook|oauth|composio|integration|deploy|github|vercel|netlify|crud|schema|storage|subscription|credits?)\b/i;
const FULL_BUILD_PATTERN =
  /\b(build|create|generate|make|clone|redesign)\b.*\b(app|website|site|page|landing page|dashboard|store|marketplace|portfolio|saas|crm|tool)\b/i;
const APP_WIDE_PATTERN =
  /\b(entire|whole|every|all pages|app-wide|site-wide|full redesign|rebuild everything|across the app)\b/i;

/**
 * Message-credit pricing intentionally follows Base44-style scope pricing.
 * BYOK and Cryzo Free models bypass this function entirely at request time.
 */
export function classifyCreditCost({ text, mode, hasFiles }: CreditCostInput) {
  if (mode === "plan") return 0.3;

  const normalized = text.trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (APP_WIDE_PATTERN.test(normalized)) return 3.5;
  if (FULL_BUILD_PATTERN.test(normalized)) return 2;
  if (FEATURE_PATTERN.test(normalized)) return 1;
  if (hasFiles && wordCount > 20) return 1;
  if (wordCount <= 12 && SIMPLE_TWEAK_PATTERN.test(normalized)) return 0.5;
  if (wordCount <= 8 && !hasFiles) return 0.5;

  return 1;
}

export function describeCreditCharge(cost: number) {
  if (cost === 0.3) return "Plan / discuss request";
  if (cost === 0.5) return "Simple request";
  if (cost === 1) return "Feature request";
  if (cost === 2) return "Complex module or full build";
  if (cost >= 3) return "App-wide change";
  return "Managed AI request";
}
