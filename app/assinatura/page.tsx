"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { X } from "lucide-react"

type PlanCard = {
  key: "hobbie" | "entusiasta" | "profissional"
  name: string
  price: string
  summary: string
  highlight?: boolean
  features: { text: string; enabled: boolean }[]
}

const plans: PlanCard[] = [
  {
    key: "hobbie",
    name: "Hobbie",
    price: "R$19/mês",
    summary: "Para acompanhar e participar das discussões.",
    features: [
      { text: "Acesso limitado por quantidade", enabled: true },
      { text: "Acesso com atraso", enabled: true },
      { text: "Comentar", enabled: true },
      { text: "Responder comentários", enabled: true },
      { text: "Pedir por conteúdo", enabled: true },
      { text: "Inserir dados estruturados", enabled: false },
      { text: "Inserir experiência pessoal", enabled: false },
      { text: "Criar novo modelo", enabled: false },
    ],
  },
  {
    key: "entusiasta",
    name: "Entusiasta",
    price: "R$39/mês",
    summary: "Para contribuir e ter acesso completo.",
    highlight: true,
    features: [
      { text: "Acesso ilimitado", enabled: true },
      { text: "Acesso imediato + notificações", enabled: true },
      { text: "Inserir experiência pessoal", enabled: true },
      { text: "Inserir defeitos crônicos e pontuais", enabled: true },
      { text: "Inserir pontos positivos", enabled: true },
      { text: "Dar dicas de solução", enabled: true },
      { text: "Autoria atribuída", enabled: true },
      { text: "Criar novo modelo", enabled: false },
    ],
  },
  {
    key: "profissional",
    name: "Profissional",
    price: "R$79/mês",
    summary: "Para estruturar e expandir a base.",
    features: [
      { text: "Tudo do Entusiasta", enabled: true },
      { text: "Inserir novo modelo", enabled: true },
      { text: "Ser primeiro avaliador", enabled: true },
      { text: "Autoria destacada", enabled: true },
      { text: "Maior peso na validação", enabled: true },
      { text: "Acesso antecipado total", enabled: true },
    ],
  },
]

export default function AssinaturaPage() {
  const { session } = useAuth()
  const router = useRouter()
  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [loadingPlanKey, setLoadingPlanKey] = useState<string | null>(null)
  const [openingPortal, setOpeningPortal] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackType, setFeedbackType] = useState<"success" | "error" | null>(null)

  useEffect(() => {
    const fetchPlan = async () => {
      if (!session?.user) return
      const { data } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()

      setCurrentPlan((data?.plan as string | null) ?? null)
    }

    void fetchPlan()
  }, [session?.user])

  useEffect(() => {
    if (typeof window === "undefined") return
    const status = new URLSearchParams(window.location.search).get("status")
    if (status === "success") {
      setFeedback("Pagamento confirmado. Seu plano será atualizado em instantes.")
      setFeedbackType("success")
      return
    }
    if (status === "canceled") {
      setFeedback("Pagamento cancelado. Você pode tentar novamente quando quiser.")
      setFeedbackType("error")
      return
    }
    setFeedback(null)
    setFeedbackType(null)
  }, [])

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => {
      setFeedback(null)
      setFeedbackType(null)
    }, 7000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const hasActivePlan = useMemo(
    () => Boolean(currentPlan && ["hobbie", "entusiasta", "profissional"].includes(currentPlan)),
    [currentPlan]
  )

  const withAuthHeader = async () => {
    const token = session?.access_token
    if (!token) {
      router.push("/login")
      return null
    }
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    }
  }

  const startCheckout = async (plan: PlanCard["key"]) => {
    const headers = await withAuthHeader()
    if (!headers) return

    setLoadingPlanKey(plan)
    setFeedback(null)
    setFeedbackType(null)
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers,
        body: JSON.stringify({ plan }),
      })
      const payload = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !payload.url) {
        setFeedback(payload.error ?? "Não foi possível iniciar o pagamento.")
        setFeedbackType("error")
        return
      }
      window.location.href = payload.url
    } catch {
      setFeedback("Erro inesperado ao iniciar o checkout.")
      setFeedbackType("error")
    } finally {
      setLoadingPlanKey(null)
    }
  }

  const openBillingPortal = async () => {
    const headers = await withAuthHeader()
    if (!headers) return

    setOpeningPortal(true)
    setFeedback(null)
    setFeedbackType(null)
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers,
      })
      const payload = (await response.json()) as { url?: string; error?: string }
      if (!response.ok || !payload.url) {
        setFeedback(payload.error ?? "Não foi possível abrir o portal de assinatura.")
        setFeedbackType("error")
        return
      }
      window.location.href = payload.url
    } catch {
      setFeedback("Erro inesperado ao abrir o portal de assinatura.")
      setFeedbackType("error")
    } finally {
      setOpeningPortal(false)
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <section className="mx-auto max-w-6xl px-8 pb-12 pt-32 text-center">
        <h1 className="mb-6 text-4xl font-bold md:text-5xl">Escolha seu nível de acesso</h1>
        <p className="mx-auto max-w-2xl text-lg text-gray-600">
          A Base Automotiva oferece níveis de participação diferentes. Escolha o plano ideal para
          o seu perfil.
        </p>
        {hasActivePlan ? (
          <button
            type="button"
            onClick={openBillingPortal}
            disabled={openingPortal}
            className="mt-6 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {openingPortal ? "Abrindo portal..." : "Gerenciar assinatura"}
          </button>
        ) : null}
      </section>

      <section className="mx-auto max-w-6xl px-8 pb-24">
        <div className="grid items-stretch gap-10 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.key
            const isLoading = loadingPlanKey === plan.key

            return (
              <div
                key={plan.key}
                className={`relative flex flex-col rounded-2xl p-8 ${
                  isCurrent
                    ? "border-2 border-green-500 bg-green-50/30 shadow-lg"
                    : plan.highlight
                      ? "border-2 border-black shadow-lg"
                      : "border border-gray-200"
                }`}
              >
                {isCurrent ? (
                  <div className="absolute right-3 top-3 rounded-full border border-green-300 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-green-700">
                    Plano atual
                  </div>
                ) : null}
                {plan.highlight ? (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-black px-4 py-1 text-sm text-white">
                    Mais escolhido
                  </div>
                ) : null}

                <h2 className="mb-2 text-2xl font-semibold">{plan.name}</h2>
                <p className="mb-6 text-gray-500">{plan.summary}</p>
                <div className="mb-8 text-3xl font-bold">{plan.price}</div>

                <ul className="flex-1 space-y-3 text-sm text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className={feature.enabled ? "" : "text-gray-400"}>
                      {feature.enabled ? "✔" : "✖"} {feature.text}
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  onClick={() => startCheckout(plan.key)}
                  disabled={isLoading}
                  className="mt-10 rounded-lg bg-black py-3 text-white transition hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isCurrent
                    ? "Plano atual"
                    : isLoading
                      ? "Redirecionando..."
                      : `Assinar ${plan.name}`}
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {feedback ? (
        <div className="fixed right-4 top-[86px] z-[70] w-[360px] max-w-[calc(100vw-2rem)]">
          <div
            className={`rounded-xl border bg-white/95 p-3 shadow-lg backdrop-blur-sm ${
              feedbackType === "success" ? "border-green-200" : "border-red-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <p
                className={`text-sm font-medium ${
                  feedbackType === "success" ? "text-green-800" : "text-red-700"
                }`}
              >
                {feedback}
              </p>
              <button
                type="button"
                onClick={() => {
                  setFeedback(null)
                  setFeedbackType(null)
                }}
                className="rounded-md p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Fechar aviso"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                key={feedback}
                className={`toast-timer-bar h-full w-full rounded-full ${
                  feedbackType === "success" ? "bg-green-500" : "bg-red-500"
                }`}
                style={{ animationDuration: "7000ms" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
