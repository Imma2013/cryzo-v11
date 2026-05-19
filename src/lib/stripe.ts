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

export const PLANS = {
  pro: {
    name: "Pro",
    price: 1500,
    credits: 100,
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? "",
    topupPriceId:
      process.env.STRIPE_TOPUP_100_PRICE_ID ??
      process.env.STRIPE_TOPUP_PRO_PRICE_ID ??
      "",
    topupPrice: 1500,
    topupCredits: 100,
  },
  pro_plus: {
    name: "Pro+",
    price: 5000,
    credits: 250,
    priceId:
      process.env.STRIPE_PRO_PLUS_PRICE_ID ??
      process.env.STRIPE_BUSINESS_PRICE_ID ??
      "",
    topupPriceId:
      process.env.STRIPE_TOPUP_100_PRICE_ID ??
      process.env.STRIPE_TOPUP_BUSINESS_PRICE_ID ??
      process.env.STRIPE_TOPUP_PRO_PRICE_ID ??
      "",
    topupPrice: 2000,
    topupCredits: 100,
  },
} as const;

export type PaidPlan = keyof typeof PLANS;

export const TOP_UP_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const credits = (index + 1) * 100;
  return {
    credits,
    price: (credits / 100) * 1500,
  };
});

export function isPaidPlan(plan: string): plan is PaidPlan {
  return plan === "pro" || plan === "pro_plus";
}

export function resolvePlanFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return undefined;

  for (const [plan, config] of Object.entries(PLANS)) {
    if (config.priceId === priceId) return plan as PaidPlan;
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

export function classifyCreditCost({ text, hasFiles }: CreditCostInput) {
  const normalized = text.trim();
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;

  if (FULL_BUILD_PATTERN.test(normalized)) return 2;
  if (FEATURE_PATTERN.test(normalized)) return 1.2;
  if (hasFiles && wordCount > 20) return 1.2;
  if (wordCount <= 12 && SIMPLE_TWEAK_PATTERN.test(normalized)) return 0.5;
  if (wordCount <= 8 && !hasFiles) return 0.5;

  return 1;
}

export function describeCreditCharge(cost: number) {
  if (cost === 0.5) return "Simple request";
  if (cost === 1.2) return "Feature or integration request";
  if (cost === 2) return "Full build request";
  return "Normal request";
}
