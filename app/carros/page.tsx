"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import VehicleCardImage from "@/components/VehicleCardImage"
import StarRating from "@/components/ui/StarRating"

type EnrichedVehicle = {
  id: string
  slug: string
  year: number
  engine: string
  transmission: string
  versionName: string
  versionTier: string
  modelName: string
  brandName: string
  image_url: string | null
  rating: number | null
  ratingCount: number
  topPositive: string | null
}

type VehicleRow = {
  id: string
  slug: string
  image_url?: string | null
  year: number
  engine: string
  transmission: string
  version_name: string | null
  version_tier: string | null
  vehicles:
    | {
        name: string | null
        image_url: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }[]
    | {
        name: string | null
        image_url: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }
    | null
}

type PositiveRow = {
  id: string
  vehicle_version_id: string
  description: string
}

type PositiveVoteRow = {
  positive_id: string
  is_confirmed: boolean
}

type RatingRow = {
  vehicle_version_id: string
  rating: number
}

export default function CarrosPage() {
  const { session } = useAuth()

  const [vehicles, setVehicles] = useState<EnrichedVehicle[]>([])
  const [loadingVehicles, setLoadingVehicles] = useState(true)
  const [fetchError, setFetchError] = useState("")
  const [plan, setPlan] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedYear, setSelectedYear] = useState("all")

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoadingVehicles(true)
      setFetchError("")

      const fullSelect = `
          id,
          slug,
          image_url,
          year,
          engine,
          transmission,
          version_name,
          version_tier,
          vehicles (
            name,
            image_url,
            brands ( name )
          )
        `

      const fallbackSelect = `
          id,
          slug,
          year,
          engine,
          transmission,
          version_name,
          version_tier,
          vehicles (
            name,
            image_url,
            brands ( name )
          )
        `

      const initial = await supabase
        .from("vehicle_versions")
        .select(fullSelect)
        .order("year", { ascending: false })

      let versions = initial.data as VehicleRow[] | null
      let versionsError = initial.error

      if (versionsError && /column|schema cache/i.test(versionsError.message ?? "")) {
        const fallback = await supabase
          .from("vehicle_versions")
          .select(fallbackSelect)
          .order("year", { ascending: false })
        versions = fallback.data as VehicleRow[] | null
        versionsError = fallback.error
      }

      if (versionsError || !versions) {
        setVehicles([])
        setFetchError("Falha ao carregar os veículos.")
        setLoadingVehicles(false)
        return
      }

      const versionIds = (versions as VehicleRow[]).map((version) => version.id)

      const positivesRes = await supabase
        .from("positives")
        .select("id,vehicle_version_id,description")
        .in("vehicle_version_id", versionIds)

      const positives = (positivesRes.data as PositiveRow[] | null) ?? []
      const positiveIds = positives.map((positive) => positive.id)

      const votesRes =
        positiveIds.length > 0
          ? await supabase
              .from("positive_votes")
              .select("positive_id,is_confirmed")
              .in("positive_id", positiveIds)
          : { data: [] as PositiveVoteRow[] }

      const votes = (votesRes.data as PositiveVoteRow[] | null) ?? []

      const ratingsRes = await supabase
        .from("vehicle_version_ratings")
        .select("vehicle_version_id,rating")
        .in("vehicle_version_id", versionIds)

      const ratings =
        ratingsRes.error && /relation|table|schema cache|does not exist/i.test(ratingsRes.error.message ?? "")
          ? []
          : ((ratingsRes.data as RatingRow[] | null) ?? [])

      const positiveVotesMap: Record<string, { total: number; confirmed: number }> = {}
      for (const vote of votes) {
        const current = positiveVotesMap[vote.positive_id] ?? { total: 0, confirmed: 0 }
        current.total += 1
        if (vote.is_confirmed) current.confirmed += 1
        positiveVotesMap[vote.positive_id] = current
      }

      const positivesByVersion: Record<string, PositiveRow[]> = {}
      for (const positive of positives) {
        positivesByVersion[positive.vehicle_version_id] = [
          ...(positivesByVersion[positive.vehicle_version_id] ?? []),
          positive,
        ]
      }

      const ratingByVersion: Record<string, { sum: number; total: number }> = {}
      for (const row of ratings) {
        const current = ratingByVersion[row.vehicle_version_id] ?? { sum: 0, total: 0 }
        current.sum += row.rating
        current.total += 1
        ratingByVersion[row.vehicle_version_id] = current
      }

      const enriched = (versions as VehicleRow[]).map((version) => {
        const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
        const brand = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands
        const points = positivesByVersion[version.id] ?? []
        const rankedPoints = [...points].sort((a, b) => {
          const statsA = positiveVotesMap[a.id]?.total ?? 0
          const statsB = positiveVotesMap[b.id]?.total ?? 0
          if (statsA !== statsB) return statsB - statsA
          const confA = positiveVotesMap[a.id]?.confirmed ?? 0
          const confB = positiveVotesMap[b.id]?.confirmed ?? 0
          return confB - confA
        })
        const ratingStats = ratingByVersion[version.id]
        const rating =
          ratingStats && ratingStats.total > 0
            ? Number((ratingStats.sum / ratingStats.total).toFixed(1))
            : null

        return {
          id: version.id,
          slug: version.slug,
          year: version.year,
          engine: version.engine,
          transmission: version.transmission,
          versionName: version.version_name ?? "",
          versionTier: version.version_tier ?? "",
          modelName: vehicle?.name ?? "",
          brandName: brand?.name ?? "",
          image_url: version.image_url ?? vehicle?.image_url ?? null,
          rating,
          ratingCount: ratingStats?.total ?? 0,
          topPositive: rankedPoints[0]?.description ?? null,
        }
      })

      setVehicles(enriched)
      setLoadingVehicles(false)
    }

    fetchVehicles()
  }, [])

  useEffect(() => {
    const fetchPlan = async () => {
      if (!session?.user) return

      const { data } = await supabase
        .from("profiles")
        .select("plan")
        .eq("id", session.user.id)
        .single()

      if (data) setPlan(data.plan)
    }

    fetchPlan()
  }, [session])

  const brands = useMemo(
    () =>
      Array.from(new Set(vehicles.map((vehicle) => vehicle.brandName).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b)
      ),
    [vehicles]
  )

  const years = useMemo(
    () => Array.from(new Set(vehicles.map((vehicle) => vehicle.year))).sort((a, b) => b - a),
    [vehicles]
  )

  const filteredVehicles = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    return vehicles.filter((vehicle) => {
      const matchesBrand = selectedBrand === "all" || vehicle.brandName === selectedBrand
      const matchesYear =
        selectedYear === "all" || String(vehicle.year) === selectedYear

      const searchableText = [
        vehicle.brandName,
        vehicle.modelName,
        vehicle.versionName,
        vehicle.engine,
        vehicle.transmission,
        String(vehicle.year),
      ]
        .join(" ")
        .toLowerCase()

      const matchesSearch = !term || searchableText.includes(term)

      return matchesBrand && matchesYear && matchesSearch
    })
  }, [searchTerm, selectedBrand, selectedYear, vehicles])

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-8 py-28">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Veículos</h1>

        {plan === "profissional" && (
          <Link
            href="/carros/novo"
            className="bg-black text-white px-5 py-2 rounded-lg shadow-sm hover:bg-gray-900 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
          >
            Novo
          </Link>
        )}
      </div>

      <div className="mb-8 grid gap-3 md:grid-cols-[1fr_220px_160px]">
        <input
          type="text"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Buscar por modelo, marca, versão, motor..."
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-black/15 focus:border-black/40"
        />

        <select
          value={selectedBrand}
          onChange={(event) => setSelectedBrand(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/15 focus:border-black/40"
        >
          <option value="all">Todas as marcas</option>
          {brands.map((brand) => (
            <option key={brand} value={brand}>
              {brand}
            </option>
          ))}
        </select>

        <select
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black/15 focus:border-black/40"
        >
          <option value="all">Todos os anos</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {filteredVehicles.length} {filteredVehicles.length === 1 ? "resultado" : "resultados"}
      </p>

      {loadingVehicles ? (
        <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Carregando veículos...
        </div>
      ) : null}

      {!loadingVehicles && fetchError ? (
        <div className="mt-10 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          {fetchError}
        </div>
      ) : null}

      <div className="grid md:grid-cols-3 gap-8">
        {filteredVehicles.map((version) => (
          <Link
            key={version.id}
            href={`/carros/${version.slug}`}
            className="group border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer"
          >
            {version.image_url && (
              <VehicleCardImage
                src={version.image_url}
                alt={`${version.modelName} ${version.versionName} ${version.year}`}
              />
            )}

            <div className="-mt-px bg-gray-700 px-6 py-3">
              <h2 className="text-lg font-semibold text-white tracking-tight">
                {version.modelName}
              </h2>
            </div>

            <div className="p-6">
              <p className="text-sm font-medium text-gray-900">Ano {version.year}</p>

              <p className="text-gray-500 text-sm mt-2 transition-colors duration-300 group-hover:text-gray-600">
                {version.brandName} • Intermediaria • {version.engine} {version.transmission}
              </p>

              <div className="mt-3">
                <StarRating rating={version.ratingCount > 0 ? (version.rating ?? 0) : 0} showValue={version.ratingCount > 0} />
                <p className="mt-1 text-xs text-gray-500">
                  {version.ratingCount > 0
                    ? `${version.ratingCount} ${version.ratingCount === 1 ? "avaliação" : "avaliações"}`
                    : "Ainda não há avaliações suficientes para este modelo."}
                </p>
              </div>

              <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                <span className="font-medium text-gray-800">Ponto em destaque:</span>{" "}
                {version.topPositive ?? "Comunidade em crescimento para este modelo."}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {!loadingVehicles && !fetchError && !filteredVehicles.length ? (
        <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Nenhum modelo encontrado com os filtros atuais.
        </div>
      ) : null}
    </div>
  )
}

