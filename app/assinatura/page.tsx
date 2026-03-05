"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

export default function Assinatura() {
  const { session } = useAuth()
  const router = useRouter()

  const [currentPlan, setCurrentPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    const fetchPlan = async () => {
      if (!session?.user) return

      const { data } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()

      if (data) {
        setCurrentPlan(data.plan)
      }
    }

    fetchPlan()
  }, [session])

  const handlePlanChange = async (plan: string) => {
    if (!session?.user) {
      router.push("/login")
      return
    }

    setLoading(plan)

    const { error } = await supabase
      .from("profiles")
      .update({ plan })
      .eq("id", session.user.id)

    if (!error) {
      setCurrentPlan(plan)
    }

    setLoading(null)
  }

  return (
    <main className="bg-white min-h-screen">

      {/* HERO DA PÁGINA */}
      <section className="max-w-6xl mx-auto px-8 pt-32 pb-20 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-6">
          Escolha seu nível de acesso
        </h1>

        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          A Base Automotiva oferece diferentes níveis de participação e acesso.
          Escolha o plano ideal para o seu perfil.
        </p>
      </section>

      {/* PLANOS */}
      <section className="max-w-6xl mx-auto px-8 pb-32">
        <div className="grid md:grid-cols-3 gap-10 items-stretch">

          {/* HOBBIE */}
          <div className="border border-gray-200 rounded-2xl p-8 flex flex-col">
            <h2 className="text-2xl font-semibold mb-2">Hobbie</h2>

            <p className="text-gray-500 mb-6">
              Para quem deseja acompanhar e participar das discussões.
            </p>

            <div className="text-3xl font-bold mb-8">
              R$19<span className="text-base font-medium text-gray-500">/mês</span>
            </div>

            <ul className="space-y-4 text-gray-700 flex-1">
              <li>✔ Acesso limitado por quantidade</li>
              <li>✔ Acesso com atraso</li>
              <li>✔ Comentar</li>
              <li>✔ Responder comentários</li>
              <li>✔ Pedir por conteúdo</li>
              <li className="text-gray-400">✖ Inserir dados estruturados</li>
              <li className="text-gray-400">✖ Inserir experiência pessoal</li>
              <li className="text-gray-400">✖ Criar novo modelo</li>
            </ul>

            <button
              onClick={() => handlePlanChange("hobbie")}
              disabled={loading === "hobbie"}
              className="mt-10 bg-black text-white py-3 rounded-lg hover:bg-gray-900 transition"
            >
              {currentPlan === "hobbie"
                ? "Plano atual"
                : loading === "hobbie"
                ? "Atualizando..."
                : "Assinar Hobbie"}
            </button>
          </div>

          {/* ENTUSIASTA */}
          <div className="border-2 border-black rounded-2xl p-8 flex flex-col shadow-lg relative">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-black text-white text-sm px-4 py-1 rounded-full">
              Mais escolhido
            </div>

            <h2 className="text-2xl font-semibold mb-2">Entusiasta</h2>

            <p className="text-gray-500 mb-6">
              Para quem deseja contribuir e ter acesso completo.
            </p>

            <div className="text-3xl font-bold mb-8">
              R$39<span className="text-base font-medium text-gray-500">/mês</span>
            </div>

            <ul className="space-y-4 text-gray-700 flex-1">
              <li>✔ Acesso ilimitado</li>
              <li>✔ Acesso imediato + notificações</li>
              <li>✔ Inserir experiência pessoal</li>
              <li>✔ Inserir defeitos crônicos e pontuais</li>
              <li>✔ Inserir pontos positivos</li>
              <li>✔ Dar dicas de solução</li>
              <li>✔ Autoria atribuída</li>
              <li className="text-gray-400">✖ Criar novo modelo</li>
            </ul>

            <button
              onClick={() => handlePlanChange("entusiasta")}
              disabled={loading === "entusiasta"}
              className="mt-10 bg-black text-white py-3 rounded-lg hover:bg-gray-900 transition"
            >
              {currentPlan === "entusiasta"
                ? "Plano atual"
                : loading === "entusiasta"
                ? "Atualizando..."
                : "Assinar Entusiasta"}
            </button>
          </div>

          {/* PROFISSIONAL */}
          <div className="border border-gray-200 rounded-2xl p-8 flex flex-col">
            <h2 className="text-2xl font-semibold mb-2">Profissional</h2>

            <p className="text-gray-500 mb-6">
              Para quem deseja estruturar e expandir a base.
            </p>

            <div className="text-3xl font-bold mb-8">
              R$79<span className="text-base font-medium text-gray-500">/mês</span>
            </div>

            <ul className="space-y-4 text-gray-700 flex-1">
              <li>✔ Tudo do Entusiasta</li>
              <li>✔ Inserir novo modelo</li>
              <li>✔ Ser primeiro avaliador</li>
              <li>✔ Autoria destacada</li>
              <li>✔ Maior peso na validação</li>
              <li>✔ Acesso antecipado total</li>
            </ul>

            <button
              onClick={() => handlePlanChange("profissional")}
              disabled={loading === "profissional"}
              className="mt-10 bg-black text-white py-3 rounded-lg hover:bg-gray-900 transition"
            >
              {currentPlan === "profissional"
                ? "Plano atual"
                : loading === "profissional"
                ? "Atualizando..."
                : "Assinar Profissional"}
            </button>
          </div>

        </div>
      </section>

    </main>
  )
}