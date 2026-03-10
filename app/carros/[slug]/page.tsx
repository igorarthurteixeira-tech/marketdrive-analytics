import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import PositivePointsSection from "@/components/PositivePointsSection"
import CommentDiscussionSection from "@/components/CommentDiscussionSection"
import VersionRatingSection from "@/components/VersionRatingSection"
import DefectPointsSection from "@/components/DefectPointsSection"
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

type VersionDetail = {
  id: string
  vehicle_id: string
  created_by?: string | null
  image_url?: string | null
  year: number | null
  engine: string | null
  transmission: string | null
  fuel_types?: string[] | null
  potencia_cv: number | null
  potencia_texto: string | null
  potencia_alcool_cv: number | null
  potencia_gasolina_cv: number | null
  potencia_rpm: number | null
  torque_kgfm: number | null
  torque_texto: string | null
  torque_alcool_kgfm: number | null
  torque_gasolina_kgfm: number | null
  torque_rpm: number | null
  consumo_gasolina_urbano_kml?: number | null
  consumo_gasolina_estrada_kml?: number | null
  consumo_etanol_urbano_kml?: number | null
  consumo_etanol_estrada_kml?: number | null
  consumo_urbano_kml?: number | null
  consumo_estrada_kml?: number | null
  latin_ncap_pre_2021?: string | null
  latin_ncap_post_2021?: string | null
  peso_kg: number | null
  peso_potencia_alcool_kgcv: number | null
  peso_potencia_gasolina_kgcv: number | null
  peso_potencia_kgcv: number | null
  aceleracao_0_100_s: number | null
  velocidade_maxima_kmh: number | null
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

type SpecItem = {
  label: string
  value: unknown
  suffix?: string
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ v?: string }>
}) {
  const { slug } = await params
  const query = (await searchParams) ?? {}

  const fullSelect = `
      id,
      vehicle_id,
      created_by,
      image_url,
      year,
      engine,
      transmission,
      fuel_types,
      potencia_cv,
      potencia_texto,
      potencia_alcool_cv,
      potencia_gasolina_cv,
      potencia_rpm,
      torque_kgfm,
      torque_texto,
      torque_alcool_kgfm,
      torque_gasolina_kgfm,
      torque_rpm,
      consumo_gasolina_urbano_kml,
      consumo_gasolina_estrada_kml,
      consumo_etanol_urbano_kml,
      consumo_etanol_estrada_kml,
      consumo_urbano_kml,
      consumo_estrada_kml,
      latin_ncap_pre_2021,
      latin_ncap_post_2021,
      peso_kg,
      peso_potencia_alcool_kgcv,
      peso_potencia_gasolina_kgcv,
      peso_potencia_kgcv,
      aceleracao_0_100_s,
      velocidade_maxima_kmh,
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
      vehicle_id,
      year,
      engine,
      transmission,
      fuel_types,
      potencia_cv,
      potencia_texto,
      potencia_alcool_cv,
      potencia_gasolina_cv,
      potencia_rpm,
      torque_kgfm,
      torque_texto,
      torque_alcool_kgfm,
      torque_gasolina_kgfm,
      torque_rpm,
      peso_kg,
      peso_potencia_alcool_kgcv,
      peso_potencia_gasolina_kgcv,
      peso_potencia_kgcv,
      aceleracao_0_100_s,
      velocidade_maxima_kmh,
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
    .eq("slug", slug)
    .single()

  let versionRaw = initial.data as VersionDetail | null
  let versionError = initial.error

  if (versionError && /column|schema cache/i.test(versionError.message ?? "")) {
    const fallback = await supabase
      .from("vehicle_versions")
      .select(fallbackSelect)
      .eq("slug", slug)
      .single()
    versionRaw = fallback.data as VersionDetail | null
    versionError = fallback.error
  }

  const version = versionRaw
  if (!version) notFound()

  const vehicleData = Array.isArray(version.vehicles)
    ? version.vehicles[0]
    : version.vehicles

  const brandData = Array.isArray(vehicleData?.brands)
    ? vehicleData.brands[0]
    : vehicleData?.brands

  const brandName = brandData?.name ?? ""
  const modelName = vehicleData?.name ?? ""
  const imagePath = version.image_url ?? vehicleData?.image_url ?? ""
  const imageVersion = query.v ? encodeURIComponent(query.v) : ""
  const imageSrc = imagePath
    ? `${STORAGE_URL}${imagePath}${imageVersion ? `?v=${imageVersion}` : ""}`
    : ""

  const pickFirst = (source: Record<string, unknown>, keys: string[]) => {
    for (const key of keys) {
      if (source?.[key] !== undefined && source?.[key] !== null) {
        return source[key]
      }
    }
    return null
  }

  const isValidValue = (value: unknown) => {
    if (value === null || value === undefined) return false
    if (typeof value === "string") return value.trim().length > 0
    if (typeof value === "number") return Number.isFinite(value) && value > 0
    return true
  }

  const formatFuelConsumption = (alcohol: unknown, gasoline: unknown) => {
    const alcoholValid = isValidValue(alcohol)
    const gasolineValid = isValidValue(gasoline)
    if (!alcoholValid && !gasolineValid) return null
    if (alcoholValid && gasolineValid && String(alcohol) === String(gasoline)) {
      return `${alcohol} km/l`
    }
    const alcoholText = alcoholValid ? `${alcohol} km/l (E)` : ""
    const gasolineText = gasolineValid ? `${gasoline} km/l (G)` : ""
    return [alcoholText, gasolineText].filter(Boolean).join(" / ")
  }

  const formatFuelTypes = (fuels?: string[] | null) => {
    if (!Array.isArray(fuels) || fuels.length === 0) return null
    const labelMap: Record<string, string> = {
      gasolina: "Gasolina",
      etanol: "Etanol",
      diesel: "Diesel",
      eletrico: "Elétrico",
      hibrido: "Híbrido",
      gnv: "GNV",
    }
    return fuels
      .map((fuel) => labelMap[fuel.toLowerCase()] ?? fuel)
      .join(" / ")
  }

  const geraisItems: SpecItem[] = [
    { label: "Motorização", value: version.engine },
    { label: "Combustível", value: formatFuelTypes(version.fuel_types) },
    {
      label: "Potência (cv)",
      value: (() => {
        if (isValidValue(version.potencia_texto)) return version.potencia_texto

        const alc = pickFirst(version, ["potencia_alcool_cv"])
        const gas = pickFirst(version, ["potencia_gasolina_cv"])
        const rpm = pickFirst(version, ["potencia_rpm"])
        if (isValidValue(alc) || isValidValue(gas)) {
          const alcText = isValidValue(alc) ? `${alc} cv (E)` : ""
          const gasText = isValidValue(gas) ? `${gas} cv (G)` : ""
          const joined = [alcText, gasText].filter(Boolean).join(" / ")
          return isValidValue(rpm) ? `${joined} a ${rpm} rpm` : joined
        }

        const ref = pickFirst(version, ["potencia_cv", "power_cv"])
        if (!isValidValue(ref)) return null
        return isValidValue(rpm) ? `${ref} cv a ${rpm} rpm` : `${ref} cv`
      })(),
    },
    {
      label: "Torque (kgfm)",
      value: (() => {
        if (isValidValue(version.torque_texto)) return version.torque_texto

        const alc = pickFirst(version, ["torque_alcool_kgfm"])
        const gas = pickFirst(version, ["torque_gasolina_kgfm"])
        const rpm = pickFirst(version, ["torque_rpm"])
        if (isValidValue(alc) || isValidValue(gas)) {
          const alcText = isValidValue(alc) ? `${alc} kgfm (E)` : ""
          const gasText = isValidValue(gas) ? `${gas} kgfm (G)` : ""
          const joined = [alcText, gasText].filter(Boolean).join(" / ")
          return isValidValue(rpm) ? `${joined} a ${rpm} rpm` : joined
        }

        const ref = pickFirst(version, ["torque_kgfm"])
        if (!isValidValue(ref)) return null
        return isValidValue(rpm) ? `${ref} kgfm a ${rpm} rpm` : `${ref} kgfm`
      })(),
    },
    {
      label: "Aceleração",
      value: pickFirst(version, ["aceleracao_0_100_s", "zero_to_hundred_s"]),
      suffix: "s",
    },
    {
      label: "Velocidade máxima",
      value: pickFirst(version, ["velocidade_maxima_kmh", "top_speed_kmh"]),
      suffix: "km/h",
    },
    {
      label: "Peso por potência (kg/cv)",
      value: (() => {
        const alc = pickFirst(version, ["peso_potencia_alcool_kgcv"])
        const gas = pickFirst(version, ["peso_potencia_gasolina_kgcv"])

        if (isValidValue(alc) || isValidValue(gas)) {
          const alcText = isValidValue(alc) ? `${alc} (E)` : ""
          const gasText = isValidValue(gas) ? `${gas} (G)` : ""
          return [alcText, gasText].filter(Boolean).join(" / ")
        }

        return pickFirst(version, ["peso_potencia_kgcv", "weight_to_power_kgcv"])
      })(),
    },
  ].filter((item) => isValidValue(item.value))

  const consumoItems: SpecItem[] = [
    {
      label: "Consumo urbano (km/l)",
      value: formatFuelConsumption(
        pickFirst(version, ["consumo_etanol_urbano_kml", "consumo_urbano_kml"]),
        pickFirst(version, ["consumo_gasolina_urbano_kml", "consumo_urbano_kml"])
      ),
    },
    {
      label: "Consumo estrada (km/l)",
      value: formatFuelConsumption(
        pickFirst(version, ["consumo_etanol_estrada_kml", "consumo_estrada_kml"]),
        pickFirst(version, ["consumo_gasolina_estrada_kml", "consumo_estrada_kml"])
      ),
    },
  ].filter((item) => isValidValue(item.value))

  const dimensoesItems: SpecItem[] = [
    {
      label: "Peso (kg)",
      value: pickFirst(version, ["peso_kg", "weight_kg"]),
    },
  ].filter((item) => isValidValue(item.value))

  const notasItems: SpecItem[] = [
    {
      label: "Latin NCAP (até 2021)",
      value: pickFirst(version, ["latin_ncap_pre_2021"]),
    },
    {
      label: "Latin NCAP (a partir de 2021)",
      value: pickFirst(version, ["latin_ncap_post_2021"]),
    },
  ].filter((item) => isValidValue(item.value))

  const specGroups = [
    { title: "Gerais", items: geraisItems },
    { title: "Consumo", items: consumoItems },
    { title: "Dimensões", items: dimensoesItems },
    { title: "Notas", items: notasItems },
  ].filter((group) => group.items.length > 0)

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen pt-32">
      <section className="max-w-7xl mx-auto px-8 pb-16">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">
            {brandName} {modelName} {version.version_name} {version.year}
          </h1>

          <Link
            href={`/carros/${slug}/editar`}
            className="bg-black text-white px-4 py-2 rounded-lg shadow-sm hover:bg-gray-900 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
          >
            Editar
          </Link>
        </div>
        <p className="text-gray-600 mb-4">{version.version_tier}</p>
      </section>

      <section className="max-w-7xl mx-auto px-8 pb-16">
        <div className="group relative w-full h-96 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/5">
          {imagePath ? (
            <Image
              src={imageSrc}
              alt={modelName}
              fill
              quality={100}
              sizes="100vw"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="w-full h-full bg-gray-100" />
          )}
        </div>
      </section>

      {specGroups.length ? (
        <section className="max-w-7xl mx-auto px-8 pb-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-1">Especificações da versão</h2>
            <p className="text-sm text-gray-600 mb-5">
              {modelName} {version.version_name}
            </p>
            <div className="space-y-6">
              {specGroups.map((group) => (
                <div key={group.title}>
                  <h3 className="text-base font-semibold text-gray-900 mb-3">{group.title}</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map((item) => (
                      <div key={`${group.title}-${item.label}`} className="rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
                        <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {String(item.value)}{item.suffix ? ` ${item.suffix}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="max-w-7xl mx-auto px-8 pb-12">
        <VersionRatingSection
          vehicleVersionId={version.id}
          vehicleId={version.vehicle_id}
        />
      </section>

      <section className="max-w-7xl mx-auto px-8 pb-32 grid lg:grid-cols-[1.2fr_0.8fr] gap-12">
        <div>
          <h2 className="text-2xl font-semibold mb-6">Defeitos Cronicos</h2>
          <DefectPointsSection
            vehicleVersionId={version.id}
            mode="chronic"
            vehicleOwnerId={version.created_by ?? null}
          />

          <h2 className="text-2xl font-semibold mt-12 mb-6">Problemas Pontuais</h2>
          <DefectPointsSection
            vehicleVersionId={version.id}
            mode="pontual"
            vehicleOwnerId={version.created_by ?? null}
          />

          <h2 className="text-2xl font-semibold mt-12 mb-6">Pontos Positivos</h2>
          <PositivePointsSection
            vehicleVersionId={version.id}
            vehicleOwnerId={version.created_by ?? null}
          />
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-6">Comentarios</h2>
          <CommentDiscussionSection
            key={version.id}
            vehicleVersionId={version.id}
            vehicleOwnerId={version.created_by ?? null}
          />
        </div>
      </section>
    </main>
  )
}

