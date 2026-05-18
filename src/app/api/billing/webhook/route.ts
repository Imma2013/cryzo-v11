import type Stripe from "stripe";
import { getStripe, isPaidPlan, resolvePlanFromPriceId } from "@/lib/stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function mapStripeStatus(status: Stripe.Subscription.Status) {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due") return "past_due";
  return "canceled";
}

function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  return ((subscription as any).current_period_end ?? 0) * 1000;
}

function subscriptionPlan(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price?.id;
  return resolvePlanFromPriceId(priceId);
}

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  const alreadyProcessed = await convex.query(api.billing.isStripeEventProcessed, {
    eventId: event.id,
  });
  if (alreadyProcessed) {
    return Response.json({ received: true, duplicate: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const { userId, plan, type, credits } = session.metadata || {};

      if (type === "topup" && userId && credits) {
        await convex.mutation(api.billing.grantCredits, {
          userId: userId as any,
          amount: Number(credits),
          reason: "topup",
          description: `${credits} top-up credits`,
          stripeEventId: event.id,
        });
        break;
      }

      if (
        session.subscription &&
        userId &&
        plan &&
        isPaidPlan(plan)
      ) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );

        await convex.mutation(api.billing.createSubscription, {
          userId: userId as any,
          plan,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
        });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as any;
      if (invoice.billing_reason !== "subscription_cycle") break;

      const stripeSubscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : typeof invoice.parent?.subscription_details?.subscription === "string"
            ? invoice.parent.subscription_details.subscription
            : undefined;

      if (stripeSubscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(
          stripeSubscriptionId,
        );
        await convex.mutation(api.billing.resetMonthlyCredits, {
          stripeSubscriptionId,
          currentPeriodEnd: subscriptionPeriodEnd(subscription),
          stripeEventId: event.id,
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const plan = subscriptionPlan(subscription);
      const updateArgs: {
        stripeSubscriptionId: string;
        plan?: "pro" | "pro_plus";
        status: "active" | "canceled" | "past_due";
        currentPeriodEnd: number;
      } = {
        stripeSubscriptionId: subscription.id,
        status: mapStripeStatus(subscription.status),
        currentPeriodEnd: subscriptionPeriodEnd(subscription),
      };
      if (plan) updateArgs.plan = plan;
      await convex.mutation(api.billing.updateSubscriptionByStripe, updateArgs);
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await convex.mutation(api.billing.updateSubscriptionByStripe, {
        stripeSubscriptionId: subscription.id,
        status: "canceled",
      });
      break;
    }
  }

  await convex.mutation(api.billing.recordStripeEvent, {
    eventId: event.id,
    eventType: event.type,
  });

  return Response.json({ received: true });
}
