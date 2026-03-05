"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

type PositivePoint = {
  id: string
  description: string
  created_by: string | null
}

type VoteRow = {
  positive_id: string
  user_id: string
  is_confirmed: boolean
}

type VoteStats = {
  confirmed: number
  denied: number
  userVote: boolean | null
}

export default function PositivePointsSection({
  vehicleVersionId,
}: {
  vehicleVersionId: string
}) {
  const { session } = useAuth()

  const [points, setPoints] = useState<PositivePoint[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)

  const canVote = Boolean(session?.user?.id)

  const quoteInComments = (pointId: string, text: string, authorName: string) => {
    if (typeof window === "undefined") return

    window.dispatchEvent(
      new CustomEvent("quote-positive-point", {
        detail: { pointId, text, authorName },
      })
    )
  }

  const getStatsFromRows = (rows: VoteRow[]) => {
    const next: Record<string, VoteStats> = {}

    for (const row of rows) {
      if (!next[row.positive_id]) {
        next[row.positive_id] = { confirmed: 0, denied: 0, userVote: null }
      }

      if (row.is_confirmed) {
        next[row.positive_id].confirmed += 1
      } else {
        next[row.positive_id].denied += 1
      }

      if (session?.user?.id && row.user_id === session.user.id) {
        next[row.positive_id].userVote = row.is_confirmed
      }
    }

    return next
  }

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage("")

    const { data: positives, error: positivesError } = await supabase
      .from("positives")
      .select("id,description,created_by")
      .eq("vehicle_version_id", vehicleVersionId)

    if (positivesError) {
      setErrorMessage("Falha ao carregar pontos positivos.")
      setLoading(false)
      return
    }

    const pointsData = (positives as PositivePoint[]) ?? []
    setPoints(pointsData)

    const authorIds = Array.from(
      new Set(pointsData.map((item) => item.created_by).filter(Boolean))
    ) as string[]

    if (authorIds.length) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id,name")
        .in("id", authorIds)

      const mappedNames: Record<string, string> = {}
      for (const row of (profilesData as any[]) ?? []) {
        mappedNames[row.id] = row.name ?? "Autor"
      }
      setAuthorNames(mappedNames)
    } else {
      setAuthorNames({})
    }

    const pointIds = pointsData.map((item) => item.id)
    if (pointIds.length) {
      const { data: votesData, error: votesError } = await supabase
        .from("positive_votes")
        .select("positive_id,user_id,is_confirmed")
        .in("positive_id", pointIds)

      if (votesError) {
        setErrorMessage("Falha ao carregar avaliacoes dos pontos positivos.")
      } else {
        setStats(getStatsFromRows((votesData as VoteRow[]) ?? []))
      }
    } else {
      setStats({})
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [vehicleVersionId, session?.user?.id])

  const vote = async (positiveId: string, isConfirmed: boolean) => {
    if (!session?.user?.id) {
      setErrorMessage("Faca login para avaliar este ponto.")
      return
    }

    setSubmittingVoteId(positiveId)
    setErrorMessage("")

    const currentVote = stats[positiveId]?.userVote

    const { error } =
      currentVote === isConfirmed
        ? await supabase
            .from("positive_votes")
            .delete()
            .eq("positive_id", positiveId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("positive_votes")
            .upsert(
              {
                positive_id: positiveId,
                user_id: session.user.id,
                is_confirmed: isConfirmed,
              },
              { onConflict: "positive_id,user_id" }
            )

    if (error) {
      setErrorMessage(`Falha ao registrar avaliacao: ${error.message}`)
      setSubmittingVoteId(null)
      return
    }

    await fetchData()
    setSubmittingVoteId(null)
  }

  const cards = useMemo(() => {
    return points.map((point) => {
      const pointStats = stats[point.id] ?? { confirmed: 0, denied: 0, userVote: null }
      const total = pointStats.confirmed + pointStats.denied
      const confirmedPct = total ? Math.round((pointStats.confirmed * 100) / total) : 0
      const deniedPct = total ? Math.round((pointStats.denied * 100) / total) : 0

      return {
        point,
        pointStats,
        total,
        confirmedPct,
        deniedPct,
        authorName: point.created_by ? authorNames[point.created_by] ?? "Autor" : "Autor",
      }
    })
  }, [points, stats, authorNames])

  if (loading) {
    return <p className="text-gray-500">Carregando pontos positivos...</p>
  }

  return (
    <div className="space-y-4">
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {!cards.length ? (
        <p className="text-gray-600">Nenhum ponto positivo cadastrado para esta versao.</p>
      ) : null}

      {cards.map(({ point, pointStats, total, confirmedPct, deniedPct, authorName }) => (
        <article
          id={`positive-point-${point.id}`}
          key={point.id}
          className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm scroll-mt-28"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            {point.created_by ? (
              <Link
                href={`/perfil/${point.created_by}`}
                className="text-sm font-medium text-gray-700 hover:text-black underline-offset-2 hover:underline"
              >
                {authorName}
              </Link>
            ) : (
              <span className="text-sm font-medium text-gray-700">{authorName}</span>
            )}

            <span className="text-xs text-gray-500">{total} avaliacoes</span>
          </div>

          <p className="text-gray-900">{point.description}</p>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => vote(point.id, true)}
              disabled={!canVote || submittingVoteId === point.id}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                pointStats.userVote === true
                  ? "bg-green-600 border-green-600 text-white"
                  : "border-green-300 text-green-700 hover:bg-green-50"
              }`}
            >
              Confirmar
            </button>

            <button
              type="button"
              onClick={() => vote(point.id, false)}
              disabled={!canVote || submittingVoteId === point.id}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                pointStats.userVote === false
                  ? "bg-red-600 border-red-600 text-white"
                  : "border-red-300 text-red-700 hover:bg-red-50"
              }`}
            >
              Negar
            </button>

            <button
              type="button"
              onClick={() => quoteInComments(point.id, point.description, authorName)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Citar nos comentarios
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-md bg-green-50 text-green-800 px-2 py-1">
              Confirmacao: {confirmedPct}% ({pointStats.confirmed})
            </div>
            <div className="rounded-md bg-red-50 text-red-800 px-2 py-1">
              Negacao: {deniedPct}% ({pointStats.denied})
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}
