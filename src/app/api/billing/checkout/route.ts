import {
  getStripe,
  isPaidPlan,
  priceIdFor,
  PLANS,
  type BillingCycle,
} from "@/lib/stripe";
import { requireRequestUserId } from "@/lib/server/request-user";

export async function POST(req: Request) {
  const userId = await requireRequestUserId(req);
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { plan, email, billingCycle } = (await req.json()) as {
    plan?: string;
    email?: string;
    billingCycle?: BillingCycle;
  };

  const cycle: BillingCycle = billingCycle === "yearly" ? "yearly" : "monthly";
  if (!plan || !isPaidPlan(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const config = PLANS[plan];
  const priceId = priceIdFor(plan, cycle);
  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        price_data: {
          currency: "usd",
          unit_amount:
            cycle === "yearly" ? config.annualPrice : config.monthlyPrice,
          recurring: { interval: cycle === "yearly" ? ("year" as const) : ("month" as const) },
          product_data: {
            name: `Cryzo ${config.name}`,
            description: `${config.messageCredits.toLocaleString()} message credits and ${config.integrationCredits.toLocaleString()} integration credits per month`,
          },
        },
        quantity: 1,
      };

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email || undefined,
    line_items: [lineItem],
    success_url: `${origin}/chat/billing?success=true`,
    cancel_url: `${origin}/chat/billing?canceled=true`,
    metadata: {
      userId,
      plan,
      billingCycle: cycle,
      type: "subscription",
    },
    subscription_data: {
      metadata: {
        userId,
        plan,
        billingCycle: cycle,
      },
    },
  });

  return Response.json({ url: session.url });
}
