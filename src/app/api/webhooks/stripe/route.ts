import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { createAdminClient } from "@/lib/supabase/admin"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "")
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ""

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature") ?? ""

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  const admin = createAdminClient()

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription
      const shopId = sub.metadata?.shop_id
      if (!shopId) break

      // Find plan by Stripe price ID
      const priceId = sub.items.data[0]?.price?.id
      const { data: plan } = priceId
        ? await admin.from("plans").select("id").eq("stripe_price_id", priceId).single()
        : { data: null }

      const periodEnd = sub.items.data[0]?.current_period_end
      await admin.from("shop_subscriptions").upsert({
        shop_id: shopId,
        plan_id: plan?.id ?? null,
        stripe_subscription_id: sub.id,
        status: mapStripeStatus(sub.status),
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      }, { onConflict: "shop_id" })
      break
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription
      const shopId = sub.metadata?.shop_id
      if (!shopId) break

      await admin.from("shop_subscriptions")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", sub.id)
      break
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice
      const subDetails = invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details : null
      const subRef = subDetails?.subscription
      const subId = typeof subRef === "string" ? subRef : subRef?.id
      if (!subId) break

      const stripeSub = await stripe.subscriptions.retrieve(subId)
      const itemPeriodEnd = stripeSub.items.data[0]?.current_period_end
      await admin.from("shop_subscriptions")
        .update({
          status: "active",
          current_period_end: itemPeriodEnd ? new Date(itemPeriodEnd * 1000).toISOString() : null,
        })
        .eq("stripe_subscription_id", subId)
      break
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice
      const subDetails = invoice.parent?.type === "subscription_details" ? invoice.parent.subscription_details : null
      const subRef = subDetails?.subscription
      const subId = typeof subRef === "string" ? subRef : subRef?.id
      if (!subId) break

      await admin.from("shop_subscriptions")
        .update({ status: "past_due" })
        .eq("stripe_subscription_id", subId)
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}

function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active": return "active"
    case "past_due": return "past_due"
    case "canceled": return "cancelled"
    case "trialing": return "trialing"
    default: return "active"
  }
}
