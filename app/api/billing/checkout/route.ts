import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/apiAuth"
import { getBaseAppUrl, getStripeClient, PLAN_PRICE_ENV } from "@/lib/stripe"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const requestedPlan = typeof body?.plan === "string" ? body.plan : ""
    const plan = requestedPlan.toLowerCase()
    const priceId = PLAN_PRICE_ENV[plan]

    if (!priceId) {
      return NextResponse.json({ error: "Plano inválido ou não configurado." }, { status: 400 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const stripe = getStripeClient()
    const appUrl = getBaseAppUrl()

    const { data: existingSub } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    let customerId = existingSub?.stripe_customer_id ?? null

    if (!customerId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle()

      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        name: profile?.name ?? undefined,
        metadata: {
          user_id: user.id,
        },
      })
      customerId = customer.id
    }

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/assinatura?status=success`,
      cancel_url: `${appUrl}/assinatura?status=canceled`,
      allow_promotion_codes: true,
      metadata: {
        user_id: user.id,
        requested_plan: plan,
      },
      subscription_data: {
        metadata: {
          user_id: user.id,
          requested_plan: plan,
        },
      },
    })

    await supabaseAdmin.from("billing_subscriptions").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
      },
      { onConflict: "user_id" }
    )

    return NextResponse.json({ url: checkout.url })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao iniciar checkout da assinatura."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

