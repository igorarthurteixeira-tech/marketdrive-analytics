import { createClient } from "@supabase/supabase-js"
import HomePreviewCard from "@/components/HomePreviewCard"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function Home() {
  let { data: versions, error } = await supabase
    .from("vehicle_versions")
    .select(`
      id,
      slug,
      year,
      image_url,
      vehicles (
        name,
        image_url,
        brands ( name )
      )
    `)
    .limit(5)

  // Fallback: some databases still keep image only in vehicle_versions.image_url.
  if (error && /column|schema cache/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from("vehicle_versions")
      .select(`
        id,
        slug,
        year,
        image_url,
        vehicles (
          name,
          brands ( name )
        )
      `)
      .limit(5)

    versions = fallback.data
    error = fallback.error
  }

  const cars = versions?.map((v: any) => {
    const vehicle = Array.isArray(v.vehicles) ? v.vehicles[0] : v.vehicles
    const brand = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands

    return {
      slug: v.slug,
      name: `${brand?.name ?? ""} ${vehicle?.name ?? ""} ${v.year ?? ""}`,
      image: vehicle?.image_url ?? v.image_url ?? null
    }
  }) ?? []

  return (
    <main>

      {/* HERO */}
      <section className="relative h-[85vh] min-h-150 flex items-center">

        <div className="absolute inset-0">
          <img
            src="/hero.png"
            alt="Análise automotiva"
            className="w-full h-full object-cover"
          />
        </div>

        <div className="absolute inset-0 bg-black/65"></div>

        <div className="relative max-w-7xl mx-auto px-8 text-white">
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-6 max-w-3xl">
            Inteligência e Transparência no Mercado Automotivo
          </h1>

          <p className="text-lg text-gray-200 max-w-2xl mb-10">
            Relatórios estruturados, análise de falhas recorrentes,
            indicadores de confiabilidade e dados colaborativos
            para decisões de compra mais conscientes.
          </p>

          <div className="flex gap-6">
            <a
              href="/carros"
              className="bg-red-600 px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition"
            >
              Explorar Modelos
            </a>

            <a
              href="/assinatura"
              className="border border-white px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
            >
              Ver Assinatura
            </a>
          </div>
        </div>

      </section>

      {/* CARDS */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-8">

          <h2 className="text-3xl font-bold mb-16 text-center">
            Modelos em destaque
          </h2>

          <div className="flex justify-center gap-10 flex-wrap">
            {cars?.map((car: any) => (
              <HomePreviewCard key={car.slug} {...car} />
            ))}
          </div>

        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-4xl mx-auto px-8 text-center">

          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Deseja ter acesso a mais avaliações?
          </h2>

          <p className="text-gray-600 text-lg mb-10">
            Tenha acesso completo a relatórios detalhados,
            histórico de falhas e dados exclusivos da comunidade.
          </p>

          <a
            href="/assinatura"
            className="inline-block bg-black text-white px-8 py-4 rounded-lg text-lg font-medium hover:bg-gray-900 transition shadow-sm"
          >
            Conhecer planos
          </a>

        </div>
      </section>

    </main>
  )
}
