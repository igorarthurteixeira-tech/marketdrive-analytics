import Stripe from "stripe"

const resolveStripeSecret = () => {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error("STRIPE_SECRET_KEY is required.")
  return key
}

export const getStripeClient = () =>
  new Stripe(resolveStripeSecret(), {
    apiVersion: "2026-02-25.clover",
    typescript: true,
  })

export const PLAN_PRICE_ENV: Record<string, string | undefined> = {
  hobbie: process.env.STRIPE_PRICE_HOBBIE,
  entusiasta: process.env.STRIPE_PRICE_ENTUSIASTA,
  profissional: process.env.STRIPE_PRICE_PROFISSIONAL,
}

export const PRICE_TO_PLAN = Object.entries(PLAN_PRICE_ENV).reduce<Record<string, string>>(
  (acc, [plan, priceId]) => {
    if (priceId) acc[priceId] = plan
    return acc
  },
  {}
)

export const getPlanFromPriceId = (priceId: string | null | undefined) => {
  if (!priceId) return null
  return PRICE_TO_PLAN[priceId] ?? null
}

export const getBaseAppUrl = () =>
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") ?? "http://localhost:3000"
