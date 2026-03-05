"use client"

import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import Link from "next/link"
import { useEffect, useState } from "react"
import VehicleCardImage from "@/components/VehicleCardImage"

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
}

export default function CarrosPage() {
  const { session } = useAuth()

  const [vehicles, setVehicles] = useState<EnrichedVehicle[]>([])
  const [plan, setPlan] = useState<string | null>(null)

  useEffect(() => {
    const fetchVehicles = async () => {
      const { data: versions, error } = await supabase
        .from("vehicle_versions")
        .select(`
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
        `)
        .order("year", { ascending: false })

      if (error || !versions) return

      const enriched = (versions as any[]).map((version: any) => {
        const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
        const brand = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands

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
          image_url: vehicle?.image_url ?? null,
        }
      })

      setVehicles(enriched)
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

  return (
    <div className="min-h-screen max-w-6xl mx-auto px-8 py-28">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-3xl font-bold">Veiculos</h1>

        {plan === "profissional" && (
          <Link
            href="/carros/novo"
            className="bg-black text-white px-5 py-2 rounded-lg shadow-sm hover:bg-gray-900 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
          >
            Novo
          </Link>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {vehicles.map((version) => (
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
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
