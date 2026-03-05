import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"
import StarRating from "@/components/ui/StarRating"
import PositivePointsSection from "@/components/PositivePointsSection"
import CommentDiscussionSection from "@/components/CommentDiscussionSection"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  const { data: version } = await supabase
    .from("vehicle_versions")
    .select(`
      id,
      year,
      engine,
      transmission,
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
    `)
    .eq("slug", slug)
    .single()

  if (!version) notFound()

  const vehicleData = Array.isArray(version.vehicles)
    ? version.vehicles[0]
    : version.vehicles

  const brandData = Array.isArray(vehicleData?.brands)
    ? vehicleData.brands[0]
    : vehicleData?.brands

  const brandName = brandData?.name ?? ""
  const modelName = vehicleData?.name ?? ""
  const imagePath = vehicleData?.image_url ?? ""

  const pickFirst = (source: any, keys: string[]) => {
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

  const specItems = [
    { label: "Motorizacao", value: version.engine },
    {
      label: "Potencia (cv)",
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
      label: "Peso (kg)",
      value: pickFirst(version, ["peso_kg", "weight_kg"]),
    },
    {
      label: "Peso por potencia (kg/cv)",
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
    {
      label: "Aceleracao",
      value: pickFirst(version, ["aceleracao_0_100_s", "zero_to_hundred_s"]),
      suffix: "s",
    },
    {
      label: "Velocidade maxima",
      value: pickFirst(version, ["velocidade_maxima_kmh", "top_speed_kmh"]),
      suffix: "km/h",
    },
  ].filter((item) => isValidValue(item.value))

  const { data: defects } = await supabase
    .from("defects")
    .select("*")
    .eq("vehicle_version_id", version.id)

  const defeitosCronicos = defects?.filter((d: any) => d.severity >= 2) ?? []
  const problemasPontuais = defects?.filter((d: any) => d.severity < 2) ?? []

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
        <StarRating rating={4} />
      </section>

      <section className="max-w-7xl mx-auto px-8 pb-16">
        <div className="group relative w-full h-96 rounded-2xl overflow-hidden shadow-lg ring-1 ring-black/5">
          {imagePath ? (
            <Image
              src={`${STORAGE_URL}${imagePath}`}
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

      {specItems.length ? (
        <section className="max-w-7xl mx-auto px-8 pb-16">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-2xl font-semibold mb-1">Especificacoes da versao</h2>
            <p className="text-sm text-gray-600 mb-5">
              {modelName} {version.version_name}
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {specItems.map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-200 px-4 py-3 bg-gray-50">
                  <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                  <p className="text-sm font-semibold text-gray-900">
                    {String(item.value)}{item.suffix ? ` ${item.suffix}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="max-w-7xl mx-auto px-8 pb-32 grid lg:grid-cols-[1.2fr_0.8fr] gap-12">
        <div>
          <h2 className="text-2xl font-semibold mb-6">Defeitos Cronicos</h2>
          <ul className="space-y-3 text-gray-700">
            {defeitosCronicos.map((item: any) => (
              <li key={item.id}>- {item.title}</li>
            ))}
          </ul>

          <h2 className="text-2xl font-semibold mt-12 mb-6">Problemas Pontuais</h2>
          <ul className="space-y-3 text-gray-700">
            {problemasPontuais.map((item: any) => (
              <li key={item.id}>- {item.title}</li>
            ))}
          </ul>

          <h2 className="text-2xl font-semibold mt-12 mb-6">Pontos Positivos</h2>
          <PositivePointsSection vehicleVersionId={version.id} />
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-6">Comentarios</h2>
          <CommentDiscussionSection vehicleVersionId={version.id} />
        </div>
      </section>
    </main>
  )
}
