"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Star } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import StarRating from "@/components/ui/StarRating"

type RatingRow = {
  vehicle_version_id: string
  user_id: string
  rating: number
}

type VehicleVersionRow = {
  id: string
}

export default function VersionRatingSection({
  vehicleVersionId,
  vehicleId,
}: {
  vehicleVersionId: string
  vehicleId: string
}) {
  const { session } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tableAvailable, setTableAvailable] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [versionRating, setVersionRating] = useState<number | null>(null)
  const [versionRatingCount, setVersionRatingCount] = useState(0)
  const [modelRating, setModelRating] = useState<number | null>(null)
  const [modelRatingCount, setModelRatingCount] = useState(0)
  const [userRating, setUserRating] = useState<number | null>(null)

  const userId = session?.user?.id ?? null

  const loadRatings = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    const versionRatingsRes = await supabase
      .from("vehicle_version_ratings")
      .select("vehicle_version_id,user_id,rating")
      .eq("vehicle_version_id", vehicleVersionId)

    if (versionRatingsRes.error) {
      // Graceful fallback until table/migration is available in all environments.
      if (/relation|table|schema cache|does not exist/i.test(versionRatingsRes.error.message ?? "")) {
        setTableAvailable(false)
        setVersionRating(null)
        setVersionRatingCount(0)
        setModelRating(null)
        setModelRatingCount(0)
        setUserRating(null)
        setLoading(false)
        return
      }

      setErrorMessage("Não foi possível carregar as avaliações deste modelo.")
      setLoading(false)
      return
    }

    setTableAvailable(true)

    const versionRows = (versionRatingsRes.data as RatingRow[] | null) ?? []
    const versionCount = versionRows.length
    const versionSum = versionRows.reduce((acc, row) => acc + row.rating, 0)
    const avgVersion = versionCount > 0 ? Number((versionSum / versionCount).toFixed(1)) : null

    setVersionRating(avgVersion)
    setVersionRatingCount(versionCount)

    if (userId) {
      const own = versionRows.find((row) => row.user_id === userId)
      setUserRating(own?.rating ?? null)
    } else {
      setUserRating(null)
    }

    const versionsRes = await supabase
      .from("vehicle_versions")
      .select("id")
      .eq("vehicle_id", vehicleId)

    if (versionsRes.error) {
      setErrorMessage("Não foi possível calcular a média geral do veículo.")
      setLoading(false)
      return
    }

    const versionIds = ((versionsRes.data as VehicleVersionRow[] | null) ?? []).map((row) => row.id)
    if (!versionIds.length) {
      setModelRating(null)
      setModelRatingCount(0)
      setLoading(false)
      return
    }

    const modelRatingsRes = await supabase
      .from("vehicle_version_ratings")
      .select("vehicle_version_id,user_id,rating")
      .in("vehicle_version_id", versionIds)

    if (modelRatingsRes.error) {
      setErrorMessage("Não foi possível calcular a média geral do veículo.")
      setLoading(false)
      return
    }

    const modelRows = (modelRatingsRes.data as RatingRow[] | null) ?? []
    const modelCount = modelRows.length
    const modelSum = modelRows.reduce((acc, row) => acc + row.rating, 0)
    const avgModel = modelCount > 0 ? Number((modelSum / modelCount).toFixed(1)) : null

    setModelRating(avgModel)
    setModelRatingCount(modelCount)
    setLoading(false)
  }, [userId, vehicleId, vehicleVersionId])

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRatings()
    }, 0)
    return () => clearTimeout(timer)
  }, [loadRatings])

  const handleRate = async (value: number) => {
    if (!userId) {
      setErrorMessage("Faça login para avaliar este veículo.")
      return
    }

    setSaving(true)
    setErrorMessage("")

    const { error } = await supabase
      .from("vehicle_version_ratings")
      .upsert(
        {
          vehicle_version_id: vehicleVersionId,
          user_id: userId,
          rating: value,
        },
        { onConflict: "vehicle_version_id,user_id" }
      )

    if (error) {
      setErrorMessage("Não foi possível salvar sua avaliação.")
      setSaving(false)
      return
    }

    await loadRatings()
    setSaving(false)
  }

  const displayVersionRating = versionRatingCount > 0 ? (versionRating ?? 0) : 0
  const displayModelRating = modelRatingCount > 0 ? (modelRating ?? 0) : 0

  const versionCountLabel = useMemo(
    () => `${versionRatingCount} ${versionRatingCount === 1 ? "avaliação" : "avaliações"}`,
    [versionRatingCount]
  )

  const modelCountLabel = useMemo(
    () => `${modelRatingCount} ${modelRatingCount === 1 ? "avaliação" : "avaliações"}`,
    [modelRatingCount]
  )

  if (!tableAvailable) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          Avaliação por estrelas será ativada após a migração do banco.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div>
        <p className="text-sm font-semibold text-gray-900">Avaliação desta versão</p>
        <div className="mt-1">
          <StarRating rating={displayVersionRating} showValue={versionRatingCount > 0} />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {versionRatingCount > 0
            ? versionCountLabel
            : "Ainda não há avaliações suficientes para este modelo."}
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">Média geral do veículo (todas as versões)</p>
        <div className="mt-1">
          <StarRating rating={displayModelRating} showValue={modelRatingCount > 0} />
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {modelRatingCount > 0
            ? modelCountLabel
            : "Ainda não há avaliações suficientes para este veículo."}
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900 mb-2">Sua avaliação</p>
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, index) => {
            const value = index + 1
            const active = (userRating ?? 0) >= value
            return (
              <button
                key={value}
                type="button"
                onClick={() => void handleRate(value)}
                disabled={saving || loading}
                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Avaliar com ${value} estrela${value > 1 ? "s" : ""}`}
              >
                <Star
                  size={18}
                  className={active ? "fill-black text-black" : "text-gray-300"}
                />
              </button>
            )
          })}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {userRating ? `Você avaliou com ${userRating} estrela${userRating > 1 ? "s" : ""}.` : "Clique nas estrelas para avaliar."}
        </p>
      </div>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
    </div>
  )
}
