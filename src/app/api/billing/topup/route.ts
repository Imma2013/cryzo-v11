import { getStripe, PLANS, isPaidPlan } from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const { userId, credits } = await req.json();

  if (
    !userId ||
    !Number.isFinite(credits) ||
    credits < 100 ||
    credits > 1000 ||
    credits % 100 !== 0
  ) {
    return Response.json({ error: "Invalid top-up amount" }, { status: 400 });
  }

  const subscription = await convex.query(api.billing.getSubscription, {
    userId: userId as any,
  });
  if (!isPaidPlan(subscription.plan)) {
    return Response.json({ error: "Top-ups require a paid plan" }, { status: 403 });
  }
  if (!subscription.stripeCustomerId) {
    return Response.json({ error: "No Stripe customer found" }, { status: 400 });
  }

  const planConfig = PLANS[subscription.plan];
  if (!planConfig.topupPriceId) {
    return Response.json({ error: "Stripe top-up price is not configured" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const quantity = credits / planConfig.topupCredits;

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: subscription.stripeCustomerId,
    line_items: [{ price: planConfig.topupPriceId, quantity }],
    success_url: `${origin}/chat/billing?topup=true`,
    cancel_url: `${origin}/chat/billing`,
    metadata: {
      userId,
      plan: subscription.plan,
      type: "topup",
      credits: String(credits),
    },
  });

  return Response.json({ url: session.url });
}
