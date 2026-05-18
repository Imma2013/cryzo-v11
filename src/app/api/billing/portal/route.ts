import { getStripe } from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const { userId } = await req.json();

  if (!userId) {
    return Response.json({ error: "Missing user ID" }, { status: 400 });
  }

  const subscription = await convex.query(api.billing.getSubscription, {
    userId: userId as any,
  });

  if (!subscription.stripeCustomerId) {
    return Response.json({ error: "No customer ID" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const stripe = getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${origin}/chat/billing`,
  });

  return Response.json({ url: session.url });
}
