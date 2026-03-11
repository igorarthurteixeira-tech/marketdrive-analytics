"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useEffect, useState } from "react"

type DraftRow = {
  id: string
  title: string
  mode: "model" | "version"
  updated_at: string
}

export default function RascunhosPage() {
  const { session, loading } = useAuth()
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [error, setError] = useState("")
  const [loadingDrafts, setLoadingDrafts] = useState(true)

  useEffect(() => {
    const fetchDrafts = async () => {
      if (!session?.user?.id) {
        setDrafts([])
        setLoadingDrafts(false)
        return
      }

      setLoadingDrafts(true)
      const { data, error: fetchError } = await supabase
        .from("vehicle_drafts")
        .select("id,title,mode,updated_at")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })

      if (fetchError) {
        setError(`Não foi possível carregar os rascunhos: ${fetchError.message}`)
        setDrafts([])
      } else {
        setError("")
        setDrafts((data as DraftRow[] | null) ?? [])
      }

      setLoadingDrafts(false)
    }

    void fetchDrafts()
  }, [session?.user?.id])

  const handleDelete = async (id: string) => {
    if (!session?.user?.id) return
    const confirmation = window.confirm("Excluir este rascunho?")
    if (!confirmation) return

    const { error: deleteError } = await supabase
      .from("vehicle_drafts")
      .delete()
      .eq("id", id)
      .eq("user_id", session.user.id)

    if (deleteError) {
      setError(`Falha ao excluir rascunho: ${deleteError.message}`)
      return
    }

    setDrafts((prev) => prev.filter((item) => item.id !== id))
  }

  if (loading) return null

  return (
    <main className="min-h-screen max-w-4xl mx-auto px-8 py-28">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Rascunhos de veículos</h1>
        <Link
          href="/carros/novo"
          className="rounded-lg bg-black px-4 py-2 text-sm text-white hover:bg-gray-900 transition-colors"
        >
          Novo cadastro
        </Link>
      </div>

      {error ? <p className="mb-4 text-red-600">{error}</p> : null}

      {loadingDrafts ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Carregando rascunhos...
        </div>
      ) : null}

      {!loadingDrafts && !drafts.length ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Nenhum rascunho salvo.
        </div>
      ) : null}

      <div className="space-y-3">
        {drafts.map((draft) => (
          <div
            key={draft.id}
            className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{draft.title || "Rascunho sem título"}</p>
                <p className="text-xs text-gray-500">
                  {draft.mode === "model" ? "Novo modelo + versão" : "Apenas nova versão"} •{" "}
                  {new Date(draft.updated_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/carros/novo?draft=${draft.id}`}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Continuar
                </Link>
                <button
                  type="button"
                  onClick={() => void handleDelete(draft.id)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

