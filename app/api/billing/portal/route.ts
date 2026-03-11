import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/apiAuth"
import { getBaseAppUrl, getStripeClient } from "@/lib/stripe"
import { getSupabaseAdmin } from "@/lib/supabaseAdmin"

export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  try {
    const { user, error: authError } = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: authError }, { status: 401 })
    }

    const supabaseAdmin = getSupabaseAdmin()
    const stripe = getStripeClient()
    const appUrl = getBaseAppUrl()

    const { data: subRow } = await supabaseAdmin
      .from("billing_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle()

    const customerId = subRow?.stripe_customer_id

    if (!customerId) {
      return NextResponse.json(
        { error: "Nenhuma assinatura encontrada para este usuário." },
        { status: 404 }
      )
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/assinatura`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Falha ao abrir portal da assinatura."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

