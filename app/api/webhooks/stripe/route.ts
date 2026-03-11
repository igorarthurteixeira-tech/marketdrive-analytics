import { NextRequest, NextResponse } from "next/server"
import Stripe from "stripe"
import { getPlanFromPriceId, getStripeClient } from "@/lib/stripe"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

const syncSubscription = async (subscription: Stripe.Subscription) => {
  const supabaseAdmin = getSupabaseAdmin()
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
  const subscriptionId = subscription.id
  const priceId = subscription.items.data[0]?.price?.id ?? null
  const periodEnd =
    subscription.items.data[0]?.current_period_end ??
    subscription.trial_end ??
    null
  const plan = getPlanFromPriceId(priceId)
  const metadataUserId = subscription.metadata?.user_id ?? null
  let userId = metadataUserId

  if (!userId) {
    const { data: existing } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("user_id")
      .or(`stripe_subscription_id.eq.${subscriptionId},stripe_customer_id.eq.${customerId}`)
      .maybeSingle()
    userId = existing?.user_id ?? null
  }

  if (!userId) return

  const upsertPayload = {
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    stripe_price_id: priceId,
    plan,
    status: subscription.status,
    cancel_at_period_end: subscription.cancel_at_period_end,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  }

  await supabaseAdmin.from("billing_subscriptions").upsert(upsertPayload, {
    onConflict: "user_id",
  })

  const isActive = subscription.status === "active" || subscription.status === "trialing"
  await supabaseAdmin
    .from("profiles")
    .update({ plan: isActive ? plan : null })
    .eq("id", userId)
}

const handleCheckoutCompleted = async (session: Stripe.Checkout.Session) => {
  const userId = session.metadata?.user_id ?? null
  const customerId = typeof session.customer === "string" ? session.customer : null
  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : null

  if (!userId || !customerId) return

  const supabaseAdmin = getSupabaseAdmin()
  await supabaseAdmin.from("billing_subscriptions").upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      status: "incomplete",
    },
    {
      onConflict: "user_id",
    }
  )
}

export async function POST(request: NextRequest) {
  try {
    const stripe = getStripeClient()
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook não configurado." }, { status: 500 })
    }

    const signature = request.headers.get("stripe-signature")
    if (!signature) {
      return NextResponse.json({ error: "Assinatura do webhook ausente." }, { status: 400 })
    }

    const body = await request.text()
    const event = stripe.webhooks.constructEvent(body, signature, webhookSecret)

    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session)
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncSubscription(event.data.object as Stripe.Subscription)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no webhook Stripe."
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
