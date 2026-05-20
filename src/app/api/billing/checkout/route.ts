import { getStripe, PLANS } from "@/lib/stripe";

export async function POST(req: Request) {
  const { plan, userId, email } = await req.json();

  if (!plan || !userId || !(plan in PLANS)) {
    return Response.json({ error: "Invalid plan" }, { status: 400 });
  }

  const planConfig = PLANS[plan as keyof typeof PLANS];
  if (!planConfig.priceId) {
    return Response.json({ error: "Stripe price not configured" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: email || undefined,
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    success_url: `${origin}/chat/billing?success=true`,
    cancel_url: `${origin}/chat/billing?canceled=true`,
    metadata: { userId, plan, type: "subscription" },
  });

  return Response.json({ url: session.url });
}
