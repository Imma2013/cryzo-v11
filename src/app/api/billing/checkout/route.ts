import {
  getStripe,
  isPaidPlan,
  priceIdFor,
  type BillingCycle,
} from "@/lib/stripe";

export async function POST(req: Request) {
  const { plan, userId, email, billingCycle } = (await req.json()) as {
    plan?: string;
    userId?: string;
    email?: string;
    billingCycle?: BillingCycle;
  };

  const cycle: BillingCycle = billingCycle === "yearly" ? "yearly" : "monthly";
  if (!plan || !userId || !isPaidPlan(plan)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const priceId = priceIdFor(plan, cycle);
  if (!priceId) {
    return Response.json(
      {
        error:
          cycle === "yearly"
            ? "Stripe annual price is not configured for this plan"
            : "Stripe monthly price is not configured for this plan",
      },
      { status: 500 },
    );
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email || undefined,
    line_items: [{ price: priceId, quantity: 1 }],
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
