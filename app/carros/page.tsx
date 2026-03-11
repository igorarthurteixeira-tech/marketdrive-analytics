"use client"

import { useAuth } from "@/components/AuthProvider"
import BrandLogo from "@/components/BrandLogo"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import VehicleCardImage from "@/components/VehicleCardImage"
import StarRating from "@/components/ui/StarRating"
import UserIdentityBadge from "@/components/UserIdentityBadge"

const VEHICLES_CACHE_KEY = "carros:vehicles:v1"
const FILTERS_CACHE_KEY = "carros:filters:v1"

type EnrichedVehicle = {
  id: string
  slug: string
  createdBy: string | null
  authorName: string
  authorAvatarUrl: string | null
  year: number
  engine: string
  transmission: string
  fuelTypes: string[]
  versionName: string
  versionTier: string
  bodyStyle: string
  modelName: string
  brandName: string
  brandLogoUrl: string | null
  image_url: string | null
  rating: number | null
  ratingCount: number
  topPositive: string | null
}

type VehicleRow = {
  id: string
  slug: string
  created_by?: string | null
  image_url?: string | null
  year: number
  engine: string
  transmission: string
  fuel_types?: string[] | null
  version_name: string | null
  version_tier: string | null
  body_style?: string | null
  vehicles:
    | {
        name: string | null
        image_url: string | null
        brands:
          | { name: string | null; logo_path?: string | null }[]
          | { name: string | null; logo_path?: string | null }
          | null
      }[]
    | {
        name: string | null
        image_url: string | null
        brands:
          | { name: string | null; logo_path?: string | null }[]
          | { name: string | null; logo_path?: string | null }
          | null
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

type ProfileRow = {
  id: string
  name: string | null
  avatar_url?: string | null
}

const toBrandSlug = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

const toBrandLogoSrc = (logoPath: string | null | undefined, brandName: string) => {
  if (logoPath && logoPath.trim()) {
    const raw = logoPath.trim()
    return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `/brands/${raw}`
  }
  if (!brandName) return null
  const slug = toBrandSlug(brandName)
  return slug ? `/brands/${slug}.png` : null
}

const formatVersionTier = (tier: string | null | undefined) => {
  if (!tier) return "Não informada"
  const normalized = tier.trim().toLowerCase()
  const labels: Record<string, string> = {
    entrada: "Entrada",
    "entrada intermediaria": "Entrada intermediária",
    intermediaria: "Intermediária",
    "intermediaria luxo": "Intermediária luxo",
    luxo: "Luxo",
    "topo de linha": "Topo de linha",
    esportivo: "Esportivo",
    "esportivo de luxo": "Esportivo de luxo",
  }
  return labels[normalized] ?? tier
}

const formatBodyStyle = (value: string | null | undefined) => {
  if (!value) return "Não informada"
  const normalized = value.trim().toLowerCase()
  const labels: Record<string, string> = {
    hatch: "Hatch",
    sedan: "Sedan",
    suv: "SUV",
    crossover: "Crossover",
    picape: "Picape",
    coupe: "Cupê",
    cupe: "Cupê",
    perua: "Perua",
    wagon: "Perua",
    van: "Van",
    minivan: "Van",
    outro: "Outro",
  }
  return labels[normalized] ?? value
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
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([])
  const [compareSelectionError, setCompareSelectionError] = useState("")
  const hadVehiclesCacheOnLoad = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return

    let hasVehiclesCache = false
    let cachedVehicles: EnrichedVehicle[] | null = null
    let cachedFilters: {
      searchTerm?: string
      selectedBrand?: string
      selectedYear?: string
    } | null = null

    const rawVehicles = window.sessionStorage.getItem(VEHICLES_CACHE_KEY)
    if (rawVehicles) {
      try {
        const parsed = JSON.parse(rawVehicles) as EnrichedVehicle[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          cachedVehicles = parsed
          hasVehiclesCache = true
        }
      } catch {
        window.sessionStorage.removeItem(VEHICLES_CACHE_KEY)
      }
    }

    const rawFilters = window.sessionStorage.getItem(FILTERS_CACHE_KEY)
    if (rawFilters) {
      try {
        cachedFilters = JSON.parse(rawFilters) as {
          searchTerm?: string
          selectedBrand?: string
          selectedYear?: string
        }
      } catch {
        window.sessionStorage.removeItem(FILTERS_CACHE_KEY)
      }
    }

    if (cachedVehicles || cachedFilters) {
      queueMicrotask(() => {
        if (cachedVehicles) {
          setVehicles(cachedVehicles)
          setLoadingVehicles(false)
        }
        if (cachedFilters) {
          if (typeof cachedFilters.searchTerm === "string") setSearchTerm(cachedFilters.searchTerm)
          if (typeof cachedFilters.selectedBrand === "string") setSelectedBrand(cachedFilters.selectedBrand)
          if (typeof cachedFilters.selectedYear === "string") setSelectedYear(cachedFilters.selectedYear)
        }
      })
    }

    hadVehiclesCacheOnLoad.current = hasVehiclesCache
  }, [])

  useEffect(() => {
    const hasCachedVehicles = hadVehiclesCacheOnLoad.current

    const fetchVehicles = async () => {
      if (!hasCachedVehicles) setLoadingVehicles(true)
      setFetchError("")

      const fullSelect = `
          id,
          slug,
          created_by,
          image_url,
          year,
          engine,
          transmission,
          fuel_types,
          version_name,
          version_tier,
          body_style,
          vehicles (
            name,
            image_url,
            brands ( name, logo_path )
          )
        `

      const fallbackSelect = `
          id,
          slug,
          created_by,
          year,
          engine,
          transmission,
          fuel_types,
          version_name,
          version_tier,
          vehicles (
            name,
            image_url,
            brands ( name, logo_path )
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

        if (versionsError && /column|schema cache/i.test(versionsError.message ?? "")) {
          const legacyFallback = await supabase
            .from("vehicle_versions")
            .select(`
              id,
              slug,
              year,
              engine,
              transmission,
              fuel_types,
              version_name,
              version_tier,
              vehicles (
                name,
                image_url,
                brands ( name, logo_path )
              )
            `)
            .order("year", { ascending: false })
          versions = legacyFallback.data as VehicleRow[] | null
          versionsError = legacyFallback.error
        }
      }

      if (versionsError || !versions) {
        setVehicles([])
        setFetchError("Falha ao carregar os veículos.")
        setLoadingVehicles(false)
        return
      }

      const versionIds = (versions as VehicleRow[]).map((version) => version.id)
      const authorIds = Array.from(
        new Set(
          (versions as VehicleRow[])
            .map((version) => version.created_by)
            .filter((id): id is string => Boolean(id))
        )
      )

      const authorMap: Record<string, string> = {}
      const authorAvatarMap: Record<string, string | null> = {}
      if (authorIds.length > 0) {
        const profilesRes = await supabase
          .from("profiles")
          .select("id,name,avatar_url")
          .in("id", authorIds)
        for (const row of (profilesRes.data as ProfileRow[] | null) ?? []) {
          authorMap[row.id] = row.name ?? "Autor da comunidade"
          authorAvatarMap[row.id] = row.avatar_url ?? null
        }
      }

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
          createdBy: version.created_by ?? null,
          authorName: version.created_by ? authorMap[version.created_by] ?? "Autor da comunidade" : "Autor da comunidade",
          authorAvatarUrl: version.created_by ? authorAvatarMap[version.created_by] ?? null : null,
          year: version.year,
          engine: version.engine,
          transmission: version.transmission,
          fuelTypes: Array.isArray(version.fuel_types) ? version.fuel_types : [],
          versionName: version.version_name ?? "",
          versionTier: version.version_tier ?? "",
          bodyStyle: version.body_style ?? "",
          modelName: vehicle?.name ?? "",
          brandName: brand?.name ?? "",
          brandLogoUrl: toBrandLogoSrc(brand?.logo_path, brand?.name ?? ""),
          image_url: version.image_url ?? vehicle?.image_url ?? null,
          rating,
          ratingCount: ratingStats?.total ?? 0,
          topPositive: rankedPoints[0]?.description ?? null,
        }
      })

      setVehicles(enriched)
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(VEHICLES_CACHE_KEY, JSON.stringify(enriched))
      }
      setLoadingVehicles(false)
    }

    void fetchVehicles()
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.sessionStorage.setItem(
      FILTERS_CACHE_KEY,
      JSON.stringify({ searchTerm, selectedBrand, selectedYear })
    )
  }, [searchTerm, selectedBrand, selectedYear])

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
        vehicle.bodyStyle,
        vehicle.engine,
        vehicle.transmission,
        ...(vehicle.fuelTypes ?? []),
        String(vehicle.year),
      ]
        .join(" ")
        .toLowerCase()

      const matchesSearch = !term || searchableText.includes(term)

      return matchesBrand && matchesYear && matchesSearch
    })
  }, [searchTerm, selectedBrand, selectedYear, vehicles])

  const toggleCompareSelection = (id: string) => {
    setCompareSelectionError("")
    setSelectedCompareIds((current) => {
      if (current.includes(id)) {
        return current.filter((item) => item !== id)
      }
      if (current.length >= 5) {
        setCompareSelectionError("Limite de 5 modelos para comparação.")
        return current
      }
      return [...current, id]
    })
  }

  const canCompare = selectedCompareIds.length >= 2
  const compareHref = `/carros/comparar?ids=${encodeURIComponent(selectedCompareIds.join(","))}`

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-8 py-28">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Veículos</h1>

        {plan === "profissional" && (
          <div className="flex items-center gap-2">
            <Link
              href="/carros/rascunhos"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Rascunhos
            </Link>
            <Link
              href="/carros/novo"
              className="bg-black text-white px-5 py-2 rounded-lg shadow-sm hover:bg-gray-900 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              Novo
            </Link>
          </div>
        )}

        <div className="ml-2 flex items-center gap-2">
          {canCompare ? (
            <Link
              href={compareHref}
              className="rounded-lg border border-black px-4 py-2 text-sm font-medium text-black hover:bg-black hover:text-white transition-colors"
            >
              Comparar modelos ({selectedCompareIds.length}/5)
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
            >
              Comparar modelos ({selectedCompareIds.length}/5)
            </button>
          )}
        </div>
      </div>
      {compareSelectionError ? (
        <p className="-mt-7 mb-6 text-sm text-amber-700">{compareSelectionError}</p>
      ) : null}

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
          <div key={version.id} className="relative">
            <label className="absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-700 shadow-sm backdrop-blur">
              <input
                type="checkbox"
                className="h-4 w-4 accent-black"
                checked={selectedCompareIds.includes(version.id)}
                onChange={() => toggleCompareSelection(version.id)}
              />
              Comparar
            </label>
            <Link
              href={`/carros/${version.slug}`}
              className="group block border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-out cursor-pointer"
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
                <UserIdentityBadge
                  name={version.authorName}
                  profileId={version.createdBy}
                  avatarUrl={version.authorAvatarUrl}
                  size="xs"
                  disableProfileLink
                />

                <p className="mt-2 text-sm font-medium text-gray-900">Ano {version.year}</p>

                <p className="mt-2 text-gray-500 text-sm transition-colors duration-300 group-hover:text-gray-600">
                  <span className="inline-flex items-center gap-1.5">
                    <BrandLogo src={version.brandLogoUrl} brandName={version.brandName} className="h-4 w-4" />
                    <span>{version.brandName}</span>
                  </span>
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    Classificação: {formatVersionTier(version.versionTier)}
                  </span>
                  <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    Carroceria: {formatBodyStyle(version.bodyStyle)}
                  </span>
                  <span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-gray-700">
                    {version.engine} · {version.transmission}
                  </span>
                </div>

                <p className="mt-3 text-gray-500 text-xs transition-colors duration-300 group-hover:text-gray-600">
                  Versão: <span className="text-gray-700">{version.versionName || "Não informada"}</span>
                </p>

                <p className="text-gray-500 text-xs mt-1 transition-colors duration-300 group-hover:text-gray-600">
                  Combustível:{" "}
                  {version.fuelTypes.length
                    ? version.fuelTypes
                        .map((fuel) => {
                          const map: Record<string, string> = {
                            gasolina: "Gasolina",
                            etanol: "Etanol",
                            diesel: "Diesel",
                            eletrico: "Elétrico",
                            hibrido: "Híbrido",
                            gnv: "GNV",
                          }
                          return map[fuel.toLowerCase()] ?? fuel
                        })
                        .join(" / ")
                    : "Não informado"}
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
          </div>
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

