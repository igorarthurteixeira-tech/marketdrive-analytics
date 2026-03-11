"use client"

import VehicleCardImage from "@/components/VehicleCardImage"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useState } from "react"

type VehicleVersionCompareRow = {
  id: string
  slug: string
  year: number
  engine: string
  transmission: string
  fuel_types?: string[] | null
  version_name: string | null
  version_tier: string | null
  body_style?: string | null
  image_url?: string | null
  vehicles:
    | {
        name: string | null
        image_url: string | null
        brands:
          | { name: string | null }[]
          | { name: string | null }
          | null
      }[]
    | {
        name: string | null
        image_url: string | null
        brands:
          | { name: string | null }[]
          | { name: string | null }
          | null
      }
    | null
}

type VehicleCompare = {
  id: string
  slug: string
  modelName: string
  brandName: string
  year: number
  engine: string
  transmission: string
  fuelTypes: string[]
  versionName: string
  versionTier: string
  bodyStyle: string
  imageUrl: string | null
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

const formatFuelTypes = (fuelTypes: string[]) => {
  if (!fuelTypes.length) return "Não informado"
  const map: Record<string, string> = {
    gasolina: "Gasolina",
    etanol: "Etanol",
    diesel: "Diesel",
    eletrico: "Elétrico",
    hibrido: "Híbrido",
    gnv: "GNV",
  }
  return fuelTypes.map((fuel) => map[fuel.toLowerCase()] ?? fuel).join(" / ")
}

function CompararCarrosContent() {
  const searchParams = useSearchParams()
  const [vehicles, setVehicles] = useState<VehicleCompare[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const selectedIds = useMemo(() => {
    const idsRaw = searchParams.get("ids") ?? ""
    return idsRaw
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 5)
  }, [searchParams])

  useEffect(() => {
    const fetchVehicles = async () => {
      if (selectedIds.length < 2) {
        setError("Selecione pelo menos 2 modelos para comparar.")
        setLoading(false)
        return
      }

      setLoading(true)
      setError("")

      const { data, error: fetchError } = await supabase
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
          body_style,
          image_url,
          vehicles (
            name,
            image_url,
            brands ( name )
          )
        `)
        .in("id", selectedIds)

      if (fetchError || !data) {
        setError("Não foi possível carregar os modelos para comparação.")
        setVehicles([])
        setLoading(false)
        return
      }

      const orderMap = new Map(selectedIds.map((id, index) => [id, index]))

      const mapped = (data as VehicleVersionCompareRow[])
        .map((version) => {
          const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
          const brand = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands
          return {
            id: version.id,
            slug: version.slug,
            modelName: vehicle?.name ?? "Modelo",
            brandName: brand?.name ?? "Marca",
            year: version.year,
            engine: version.engine,
            transmission: version.transmission,
            fuelTypes: Array.isArray(version.fuel_types) ? version.fuel_types : [],
            versionName: version.version_name ?? "Não informada",
            versionTier: version.version_tier ?? "",
            bodyStyle: version.body_style ?? "",
            imageUrl: version.image_url ?? vehicle?.image_url ?? null,
          }
        })
        .sort((a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999))

      setVehicles(mapped)
      if (mapped.length < 2) {
        setError("Não há modelos suficientes para comparar.")
      }
      setLoading(false)
    }

    void fetchVehicles()
  }, [selectedIds])

  const rows: { label: string; value: (vehicle: VehicleCompare) => string }[] = [
    { label: "Marca", value: (vehicle) => vehicle.brandName },
    { label: "Modelo", value: (vehicle) => vehicle.modelName },
    { label: "Versão", value: (vehicle) => vehicle.versionName },
    { label: "Ano", value: (vehicle) => String(vehicle.year) },
    { label: "Classificação", value: (vehicle) => formatVersionTier(vehicle.versionTier) },
    { label: "Carroceria", value: (vehicle) => formatBodyStyle(vehicle.bodyStyle) },
    { label: "Motor", value: (vehicle) => vehicle.engine || "Não informado" },
    { label: "Transmissão", value: (vehicle) => vehicle.transmission || "Não informada" },
    { label: "Combustível", value: (vehicle) => formatFuelTypes(vehicle.fuelTypes) },
  ]

  return (
    <div className="min-h-screen max-w-7xl mx-auto px-8 py-28">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Comparação de modelos</h1>
          <p className="mt-2 text-sm text-gray-500">Comparando até 5 veículos selecionados.</p>
        </div>
        <Link
          href="/carros"
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Voltar para veículos
        </Link>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
          Carregando comparação...
        </div>
      ) : null}

      {!loading && error ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-amber-800">
          {error}
        </div>
      ) : null}

      {!loading && !error && vehicles.length >= 2 ? (
        <>
          {(() => {
            const columnTemplate = `180px repeat(${vehicles.length}, minmax(220px, 1fr))`
            return (
              <>
          <div
            className="grid gap-4 mb-6"
                    style={{ gridTemplateColumns: columnTemplate }}
          >
            <div />
            {vehicles.map((vehicle) => (
              <Link
                key={vehicle.id}
                href={`/carros/${vehicle.slug}`}
                className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="overflow-hidden rounded-lg">
                  {vehicle.imageUrl ? (
                    <VehicleCardImage
                      src={vehicle.imageUrl}
                      alt={`${vehicle.modelName} ${vehicle.versionName} ${vehicle.year}`}
                    />
                  ) : (
                    <div className="h-28 w-full bg-gray-100" />
                  )}
                </div>
                      <p className="mt-2 text-sm font-semibold text-gray-900 whitespace-normal break-words leading-5">
                        {vehicle.modelName}
                      </p>
                      <p className="text-xs text-gray-500 whitespace-normal break-words leading-5">
                        {vehicle.versionName}
                      </p>
              </Link>
            ))}
          </div>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                    <div className="min-w-[720px]">
                {rows.map((row) => (
                          <div
                            key={row.label}
                            className="grid border-b border-gray-100 last:border-b-0"
                            style={{ gridTemplateColumns: columnTemplate }}
                          >
                            <div className="bg-gray-50 px-4 py-3 text-left text-sm font-semibold text-gray-700">
                              {row.label}
                            </div>
                    {vehicles.map((vehicle) => (
                              <div
                                key={`${row.label}-${vehicle.id}`}
                                className="px-4 py-3 text-sm text-gray-800 whitespace-normal break-words leading-5"
                              >
                        {row.value(vehicle)}
                              </div>
                    ))}
                          </div>
                ))}
                    </div>
          </div>
              </>
            )
          })()}
        </>
      ) : null}
    </div>
  )
}

export default function CompararCarrosPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen max-w-7xl mx-auto px-8 py-28">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-gray-600">
            Carregando comparação...
          </div>
        </div>
      }
    >
      <CompararCarrosContent />
    </Suspense>
  )
}
