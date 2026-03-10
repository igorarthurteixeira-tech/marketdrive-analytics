"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import UserIdentityBadge from "@/components/UserIdentityBadge"

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
  username?: string | null
  avatar_url?: string | null
}

const toMentionLabel = (username?: string | null, name?: string | null) => {
  const cleanUsername = (username ?? "").trim().replace(/^@+/, "")
  if (cleanUsername) return `@${cleanUsername}`
  return (name ?? "Autor").trim() || "Autor"
}

export default function DefectPointsSection({
  vehicleVersionId,
  mode,
  vehicleOwnerId,
}: {
  vehicleVersionId: string
  mode: "chronic" | "pontual"
  vehicleOwnerId?: string | null
}) {
  const { session } = useAuth()

  const [points, setPoints] = useState<DefectPoint[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string | null>>({})
  const [authorMentions, setAuthorMentions] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [voteTableAvailable, setVoteTableAvailable] = useState(true)

  const canVote = Boolean(session?.user?.id)
  const minSeverity = mode === "chronic" ? 2 : 0
  const maxSeverity = mode === "chronic" ? 10 : 1

  const quoteInComments = (
    pointId: string,
    text: string,
    authorName: string,
    authorId: string | null
  ) => {
    if (typeof window === "undefined") return
    const detail = { pointType: "defect" as const, pointId, text, authorName, authorId }
    window.dispatchEvent(new CustomEvent("quote-point", { detail }))
    window.dispatchEvent(new CustomEvent("quote-defect-point", { detail }))
  }

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
        .select("id,name,username,avatar_url")
        .in("id", authorIds)

      const mappedNames: Record<string, string> = {}
      const mappedAvatars: Record<string, string | null> = {}
      const mappedMentions: Record<string, string> = {}
      for (const row of (profilesData as ProfileRow[] | null) ?? []) {
        mappedNames[row.id] = row.name ?? "Autor"
        mappedAvatars[row.id] = row.avatar_url ?? null
        mappedMentions[row.id] = toMentionLabel(row.username, row.name)
      }
      setAuthorNames(mappedNames)
      setAuthorAvatars(mappedAvatars)
      setAuthorMentions(mappedMentions)
    } else {
      setAuthorNames({})
      setAuthorAvatars({})
      setAuthorMentions({})
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
          setErrorMessage("Falha ao carregar avaliaÃ§Ãµes dos defeitos.")
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
      setErrorMessage("Faça login para avaliar este item.")
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
      setErrorMessage(`Falha ao registrar avaliação: ${error.message}`)
      setSubmittingVoteId(null)
      return
    }

    setStats((prev) => {
      const current = prev[defectId] ?? { confirmed: 0, denied: 0, userVote: null }
      let confirmed = current.confirmed
      let denied = current.denied
      let userVote: boolean | null = current.userVote

      if (current.userVote === isConfirmed) {
        if (isConfirmed) confirmed = Math.max(0, confirmed - 1)
        else denied = Math.max(0, denied - 1)
        userVote = null
      } else if (current.userVote === null) {
        if (isConfirmed) confirmed += 1
        else denied += 1
        userVote = isConfirmed
      } else {
        if (isConfirmed) {
          denied = Math.max(0, denied - 1)
          confirmed += 1
        } else {
          confirmed = Math.max(0, confirmed - 1)
          denied += 1
        }
        userVote = isConfirmed
      }

      return {
        ...prev,
        [defectId]: { confirmed, denied, userVote },
      }
    })
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
        authorMention: point.created_by
          ? authorMentions[point.created_by] ?? (authorNames[point.created_by] ?? "Autor")
          : "Autor",
      }
    })
  }, [points, stats, authorNames, authorMentions])

  if (loading) {
    return <p className="text-gray-500">Carregando...</p>
  }

  return (
    <div className="space-y-4">
      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {!cards.length ? <p className="text-gray-600">Nenhum item cadastrado para esta versão.</p> : null}

      {cards.map(({ point, pointStats, total, confirmedPct, deniedPct, authorName, authorMention }) => (
        <article
          id={`defect-point-${point.id}`}
          key={point.id}
          className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm scroll-mt-24"
        >
          <div className="flex items-center justify-between gap-3 mb-3">
            <UserIdentityBadge
              name={authorName}
              profileId={point.created_by}
              avatarUrl={point.created_by ? (authorAvatars[point.created_by] ?? null) : null}
              badgeText={point.created_by === vehicleOwnerId ? "Autor do veículo" : null}
              size="sm"
            />

            <span className="text-xs text-gray-500">{total} avaliações</span>
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

                <button
                  type="button"
                  onClick={() =>
                    quoteInComments(point.id, point.title, authorMention, point.created_by ?? null)
                  }
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  Citar nos comentários
                </button>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-md bg-green-50 text-green-800 px-2 py-1">
                  Confirmação: {confirmedPct}% ({pointStats.confirmed})
                </div>
                <div className="rounded-md bg-red-50 text-red-800 px-2 py-1">
                  Negação: {deniedPct}% ({pointStats.denied})
                </div>
              </div>
            </>
          ) : (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <p className="text-xs text-gray-500">
                Avaliação de defeitos será ativada após a migração do banco.
              </p>
              <button
                type="button"
                onClick={() =>
                  quoteInComments(point.id, point.title, authorMention, point.created_by ?? null)
                }
                className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Citar nos comentários
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  )
}


