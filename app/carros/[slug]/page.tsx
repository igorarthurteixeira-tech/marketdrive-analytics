import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import PositivePointsSection from "@/components/PositivePointsSection"
import CommentDiscussionSection from "@/components/CommentDiscussionSection"
import VersionRatingSection from "@/components/VersionRatingSection"
import DefectPointsSection from "@/components/DefectPointsSection"
import BrandLogo from "@/components/BrandLogo"
import VehicleSectionTabs from "@/components/VehicleSectionTabs"
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
  capacidade_tanque_l?: number | null
  autonomia_gasolina_urbano_km?: number | null
  autonomia_gasolina_estrada_km?: number | null
  autonomia_etanol_urbano_km?: number | null
  autonomia_etanol_estrada_km?: number | null
  airbags?: number | null
  controle_estabilidade?: boolean | null
  assistentes_seguranca?: string | null
  vidro_eletrico_dianteiro?: boolean | null
  vidro_eletrico_traseiro?: boolean | null
  ar_condicionado_tipo?: string | null
  porta_malas_l?: number | null
  entre_eixos_mm?: number | null
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

type SpecItem = {
  label: string
  value: unknown
  suffix?: string
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

const formatBodyStyle = (value: string | null | undefined) => {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  const labels: Record<string, string> = {
    hatch: "Hatch",
    sedan: "Sedan",
    suv: "SUV",
    crossover: "Crossover",
    picape: "Picape",
    pickup: "Picape",
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
      capacidade_tanque_l,
      autonomia_gasolina_urbano_km,
      autonomia_gasolina_estrada_km,
      autonomia_etanol_urbano_km,
      autonomia_etanol_estrada_km,
      airbags,
      controle_estabilidade,
      assistentes_seguranca,
      vidro_eletrico_dianteiro,
      vidro_eletrico_traseiro,
      ar_condicionado_tipo,
      porta_malas_l,
      entre_eixos_mm,
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
      body_style,
      vehicles (
        name,
        image_url,
        brands ( name, logo_path )
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
        brands ( name, logo_path )
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
  const brandLogoUrl = toBrandLogoSrc(brandData?.logo_path, brandName)
  const modelName = vehicleData?.name ?? ""
  const bodyStyleLabel = formatBodyStyle(version.body_style)
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

  const toPositiveNumber = (value: unknown) => {
    if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null
    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim()
      const parsed = Number(normalized)
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null
    }
    return null
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

  const formatBoolean = (value: unknown) => {
    if (value === true) return "Sim"
    if (value === false) return "Não"
    return null
  }

  const geraisItems: SpecItem[] = [
    { label: "Motorização", value: version.engine },
    { label: "Carroceria", value: formatBodyStyle(version.body_style) },
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
        const storedAlc = pickFirst(version, ["peso_potencia_alcool_kgcv"])
        const storedGas = pickFirst(version, ["peso_potencia_gasolina_kgcv"])

        if (isValidValue(storedAlc) || isValidValue(storedGas)) {
          const alcText = isValidValue(storedAlc) ? `${storedAlc} (E)` : ""
          const gasText = isValidValue(storedGas) ? `${storedGas} (G)` : ""
          return [alcText, gasText].filter(Boolean).join(" / ")
        }
        const storedSingle = pickFirst(version, ["peso_potencia_kgcv", "weight_to_power_kgcv"])
        if (isValidValue(storedSingle)) return storedSingle

        const weight = toPositiveNumber(pickFirst(version, ["peso_kg", "weight_kg"]))
        if (!weight) return null

        const potenciaAlcool = toPositiveNumber(pickFirst(version, ["potencia_alcool_cv"]))
        const potenciaGasolina = toPositiveNumber(pickFirst(version, ["potencia_gasolina_cv"]))
        if (potenciaAlcool || potenciaGasolina) {
          const alcText = potenciaAlcool
            ? `${(weight / potenciaAlcool).toFixed(2)} (E)`
            : ""
          const gasText = potenciaGasolina
            ? `${(weight / potenciaGasolina).toFixed(2)} (G)`
            : ""
          const joined = [alcText, gasText].filter(Boolean).join(" / ")
          return joined || null
        }

        const potenciaSingle = toPositiveNumber(pickFirst(version, ["potencia_cv", "power_cv"]))
        if (!potenciaSingle) return null
        return Number((weight / potenciaSingle).toFixed(2))
      })(),
    },
  ].filter((item) => isValidValue(item.value))

  const consumoItems: SpecItem[] = [
    {
      label: "Capacidade do tanque (L)",
      value: pickFirst(version, ["capacidade_tanque_l"]),
    },
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
    {
      label: "Autonomia urbana (gasolina)",
      value: pickFirst(version, ["autonomia_gasolina_urbano_km"]),
      suffix: "km",
    },
    {
      label: "Autonomia estrada (gasolina)",
      value: pickFirst(version, ["autonomia_gasolina_estrada_km"]),
      suffix: "km",
    },
    {
      label: "Autonomia urbana (etanol)",
      value: pickFirst(version, ["autonomia_etanol_urbano_km"]),
      suffix: "km",
    },
    {
      label: "Autonomia estrada (etanol)",
      value: pickFirst(version, ["autonomia_etanol_estrada_km"]),
      suffix: "km",
    },
  ].filter((item) => isValidValue(item.value))

  const dimensoesItems: SpecItem[] = [
    {
      label: "Peso (kg)",
      value: pickFirst(version, ["peso_kg", "weight_kg"]),
    },
  ].filter((item) => isValidValue(item.value))

  const segurancaItems: SpecItem[] = [
    {
      label: "Airbags",
      value: pickFirst(version, ["airbags"]),
    },
    {
      label: "Controle de estabilidade",
      value: formatBoolean(pickFirst(version, ["controle_estabilidade"])),
    },
    {
      label: "Assistentes de segurança",
      value: pickFirst(version, ["assistentes_seguranca"]),
    },
  ].filter((item) => isValidValue(item.value))

  const confortoItems: SpecItem[] = [
    {
      label: "Vidro elétrico dianteiro",
      value: formatBoolean(pickFirst(version, ["vidro_eletrico_dianteiro"])),
    },
    {
      label: "Vidro elétrico traseiro",
      value: formatBoolean(pickFirst(version, ["vidro_eletrico_traseiro"])),
    },
    {
      label: "Ar-condicionado",
      value: pickFirst(version, ["ar_condicionado_tipo"]),
    },
    {
      label: "Porta-malas",
      value: pickFirst(version, ["porta_malas_l"]),
      suffix: "L",
    },
    {
      label: "Entre-eixos",
      value: pickFirst(version, ["entre_eixos_mm"]),
      suffix: "mm",
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
    { title: "Segurança", items: segurancaItems },
    { title: "Conforto", items: confortoItems },
    { title: "Dimensões", items: dimensoesItems },
    { title: "Notas", items: notasItems },
  ].filter((group) => group.items.length > 0)

  const specGroupIdMap: Record<string, string> = {
    Gerais: "spec-gerais",
    Consumo: "spec-consumo",
    Segurança: "spec-seguranca",
    Conforto: "spec-conforto",
    Dimensões: "spec-dimensoes",
    Notas: "spec-notas",
  }

  const sectionShortcuts = [
    ...specGroups
      .map((group) => {
        const id = specGroupIdMap[group.title]
        return id ? { id, label: group.title } : null
      })
      .filter((item): item is { id: string; label: string } => Boolean(item)),
    { id: "comentarios", label: "Comentários" },
    { id: "defeitos-cronicos", label: "Defeitos crônicos" },
    { id: "defeitos-pontuais", label: "Problemas pontuais" },
    { id: "positivos", label: "Pontos positivos" },
  ]

  return (
    <main className="bg-gradient-to-b from-white to-gray-50 min-h-screen pt-32">
      <section className="max-w-7xl mx-auto px-8 pb-16">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-4xl font-bold mb-4 tracking-tight">
            {brandName} {modelName} {version.version_name} {bodyStyleLabel ?? ""} {version.year}
          </h1>

          <div className="flex items-center gap-2">
            <Link
              href="/carros"
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Voltar
            </Link>
            <Link
              href={`/carros/${slug}/editar`}
              className="bg-black text-white px-4 py-2 rounded-lg shadow-sm hover:bg-gray-900 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
            >
              Editar
            </Link>
          </div>
        </div>
        <p className="text-gray-600 mb-4">
          {version.version_tier}
          {bodyStyleLabel ? ` • ${bodyStyleLabel}` : ""}
          {version.transmission ? ` • ${version.transmission}` : ""}
        </p>
        <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700">
          <BrandLogo src={brandLogoUrl} brandName={brandName} className="h-4 w-4" />
          <span>{brandName}</span>
        </div>
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

      <VehicleSectionTabs shortcuts={sectionShortcuts} />

      {specGroups.length ? (
        <section className="max-w-7xl mx-auto px-8 pb-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-1">Especificações da versão</h2>
            <p className="text-sm text-gray-600 mb-5">
              {modelName} {version.version_name} {bodyStyleLabel ?? ""}
            </p>
            <div className="space-y-6">
              {specGroups.map((group) => (
                <div key={group.title} id={specGroupIdMap[group.title]} className="scroll-mt-24">
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
          <h2 id="defeitos-cronicos" className="text-2xl font-semibold mb-6 scroll-mt-24">Defeitos Cronicos</h2>
          <DefectPointsSection
            vehicleVersionId={version.id}
            mode="chronic"
            vehicleOwnerId={version.created_by ?? null}
          />

          <h2 id="defeitos-pontuais" className="text-2xl font-semibold mt-12 mb-6 scroll-mt-24">Problemas Pontuais</h2>
          <DefectPointsSection
            vehicleVersionId={version.id}
            mode="pontual"
            vehicleOwnerId={version.created_by ?? null}
          />

          <h2 id="positivos" className="text-2xl font-semibold mt-12 mb-6 scroll-mt-24">Pontos Positivos</h2>
          <PositivePointsSection
            vehicleVersionId={version.id}
            vehicleOwnerId={version.created_by ?? null}
          />
        </div>

        <div>
          <h2 id="comentarios" className="text-2xl font-semibold mb-6 scroll-mt-24">Comentarios</h2>
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

