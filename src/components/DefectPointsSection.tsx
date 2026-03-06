"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"

type DefectPoint = {
  id: string
  title: string
  severity: number
  created_by: string | null
}

type VoteRow = {
  defect_id: string
  user_id: string
  is_confirmed: boolean
}

type VoteStats = {
  confirmed: number
  denied: number
  userVote: boolean | null
}

type ProfileRow = {
  id: string
  name: string | null
}

export default function DefectPointsSection({
  vehicleVersionId,
  mode,
}: {
  vehicleVersionId: string
  mode: "chronic" | "pontual"
}) {
  const { session } = useAuth()

  const [points, setPoints] = useState<DefectPoint[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [voteTableAvailable, setVoteTableAvailable] = useState(true)

  const canVote = Boolean(session?.user?.id)
  const minSeverity = mode === "chronic" ? 2 : 0
  const maxSeverity = mode === "chronic" ? 10 : 1

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    const { data: defects, error: defectsError } = await supabase
      .from("defects")
      .select("id,title,severity,created_by")
      .eq("vehicle_version_id", vehicleVersionId)
      .gte("severity", minSeverity)
      .lte("severity", maxSeverity)

    if (defectsError) {
      setErrorMessage("Falha ao carregar defeitos.")
      setLoading(false)
      return
    }

    const pointsData = (defects as DefectPoint[]) ?? []
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
      for (const row of (profilesData as ProfileRow[] | null) ?? []) {
        mappedNames[row.id] = row.name ?? "Autor"
      }
      setAuthorNames(mappedNames)
    } else {
      setAuthorNames({})
    }

    const pointIds = pointsData.map((item) => item.id)
    if (pointIds.length) {
      const votesRes = await supabase
        .from("defect_votes")
        .select("defect_id,user_id,is_confirmed")
        .in("defect_id", pointIds)

      if (votesRes.error) {
        if (/relation|table|schema cache|does not exist/i.test(votesRes.error.message ?? "")) {
          setVoteTableAvailable(false)
          setStats({})
        } else {
          setErrorMessage("Falha ao carregar avaliacoes dos defeitos.")
        }
      } else {
        setVoteTableAvailable(true)
        const nextStats: Record<string, VoteStats> = {}
        for (const row of (votesRes.data as VoteRow[]) ?? []) {
          if (!nextStats[row.defect_id]) {
            nextStats[row.defect_id] = { confirmed: 0, denied: 0, userVote: null }
          }

          if (row.is_confirmed) {
            nextStats[row.defect_id].confirmed += 1
          } else {
            nextStats[row.defect_id].denied += 1
          }

          if (session?.user?.id && row.user_id === session.user.id) {
            nextStats[row.defect_id].userVote = row.is_confirmed
          }
        }

        setStats(nextStats)
      }
    } else {
      setStats({})
    }

    setLoading(false)
  }, [vehicleVersionId, minSeverity, maxSeverity, session])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchData])

  const vote = async (defectId: string, isConfirmed: boolean) => {
    if (!session?.user?.id) {
      setErrorMessage("Faca login para avaliar este item.")
      return
    }
    if (!voteTableAvailable) return

    setSubmittingVoteId(defectId)
    setErrorMessage("")

    const currentVote = stats[defectId]?.userVote

    const { error } =
      currentVote === isConfirmed
        ? await supabase
            .from("defect_votes")
            .delete()
            .eq("defect_id", defectId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("defect_votes")
            .upsert(
              {
                defect_id: defectId,
                user_id: session.user.id,
                is_confirmed: isConfirmed,
              },
              { onConflict: "defect_id,user_id" }
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
    return <p className="text-gray-500">Carregando...</p>
  }

  return (
    <div className="space-y-4">
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {!cards.length ? <p className="text-gray-600">Nenhum item cadastrado para esta versão.</p> : null}

      {cards.map(({ point, pointStats, total, confirmedPct, deniedPct, authorName }) => (
        <article
          key={point.id}
          className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm"
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

          <p className="text-gray-900">{point.title}</p>

          {voteTableAvailable ? (
            <>
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
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-green-50 text-green-800 px-2 py-1">
                  Confirmacao: {confirmedPct}% ({pointStats.confirmed})
                </div>
                <div className="rounded-md bg-red-50 text-red-800 px-2 py-1">
                  Negacao: {deniedPct}% ({pointStats.denied})
                </div>
              </div>
            </>
          ) : (
            <p className="mt-3 text-xs text-gray-500">
              Avaliacao de defeitos sera ativada apos a migracao do banco.
            </p>
          )}
        </article>
      ))}
    </div>
  )
}
