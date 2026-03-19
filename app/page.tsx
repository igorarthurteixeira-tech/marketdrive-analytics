import Image from "next/image"
import Link from "next/link"
import HomePreviewCard from "@/components/HomePreviewCard"
import { getHomeFeaturedCars } from "@/lib/homeFeaturedCars"

const positioningPillars = [
  {
    title: "Dados confiáveis",
    description: "Base estruturada por versão, com foco em falhas recorrentes e sinais reais de uso.",
  },
  {
    title: "Leitura objetiva de risco",
    description: "Transformamos relatos dispersos em indicadores claros para decisão de compra.",
  },
  {
    title: "Decisão orientada por mercado",
    description: "Análise comparável entre modelos para consumidor, lojista e profissional automotivo.",
  },
]

const targetSegments = [
  "Compradores que querem reduzir risco antes de fechar negócio.",
  "Lojistas e consultores que precisam defender recomendação com dados.",
  "Entusiastas e especialistas que analisam versão por versão.",
]

const methodSteps = [
  "Mapeamos defeitos crônicos e pontuais por versão.",
  "Consolidamos validações da comunidade em indicadores de confiança.",
  "Entregamos leitura direta para decisão com contexto técnico.",
]

export default async function Home() {
  const cars = await getHomeFeaturedCars({ fixedOnly: true })

  return (
    <main className="bg-white text-gray-900">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0">
          <Image
            src="/hero.png"
            alt="Visão estratégica do mercado automotivo"
            fill
            priority
            className="object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/45" />

        <div className="relative max-w-7xl mx-auto px-8 pt-28 pb-20 md:pt-34 md:pb-24 text-white">
          <p className="text-sm uppercase tracking-[0.2em] text-white/80 mb-5">
            Marketdrive Analytics
          </p>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight max-w-4xl">
            Uma rede social para quem ama carros.
            <br />
            Dados confiáveis para quem trabalha com carros.
          </h1>

          <p className="text-lg md:text-xl text-gray-200 mt-6 max-w-3xl">
            Acompanhe a comunidade, compare versões e consulte dados claros para trabalhar melhor.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Link
              href="/carros"
              className="bg-red-600 px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition"
            >
              Analisar modelos
            </Link>
            <Link
              href="/feed"
              className="border border-white/80 px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
            >
              Feed
            </Link>
            <Link
              href="/assinatura"
              className="border border-white/80 px-6 py-3 rounded-lg hover:bg-white hover:text-black transition"
            >
              Ver planos
            </Link>
          </div>
        </div>
      </section>

      <section id="posicionamento" className="max-w-7xl mx-auto px-8 py-14 md:py-16 scroll-mt-[48px]">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-gray-500 mb-3">
              Posicionamento
            </p>
            <h2 className="text-3xl md:text-4xl font-bold leading-tight">
              Da opinião solta para decisão orientada por dados.
            </h2>
            <p className="text-gray-600 text-lg mt-5 max-w-2xl">
              A Marketdrive organiza sinais de confiabilidade por versão e transforma ruído do
              mercado em informação acionável para compra, venda e recomendação.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 space-y-5">
            {positioningPillars.map((pillar) => (
              <div key={pillar.title}>
                <h3 className="font-semibold text-gray-900">{pillar.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-7xl mx-auto px-8 py-16 grid md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-5">Para quem construímos</h2>
            <ul className="space-y-3 text-gray-700">
              {targetSegments.map((segment) => (
                <li key={segment} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-red-600" />
                  <span>{segment}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-5">Como entregamos valor</h2>
            <ol className="space-y-3 text-gray-700 list-decimal pl-5">
              {methodSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section id="base-destaque" className="max-w-7xl mx-auto px-8 py-14 md:py-16 scroll-mt-[48px]">
        <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.15em] text-gray-500 mb-2">
              Base em destaque
            </p>
            <h2 className="text-3xl font-bold">Modelos em evidência</h2>
          </div>
          <Link
            href="/carros"
            className="text-sm font-medium text-gray-700 hover:text-black underline underline-offset-4"
          >
            Ver base completa
          </Link>
        </div>

        <div className="flex justify-center gap-10 flex-wrap">
          {cars.map((car) => (
            <HomePreviewCard key={car.id} {...car} />
          ))}
        </div>
      </section>

      <section id="proximo-passo" className="bg-black text-white scroll-mt-[48px]">
        <div className="max-w-6xl mx-auto px-8 py-14 md:py-16 text-center">
          <p className="text-sm uppercase tracking-[0.2em] text-white/70 mb-4">
            Próximo passo
          </p>
          <h2 className="text-3xl md:text-4xl font-bold max-w-4xl mx-auto leading-tight">
            Estruture sua decisão de compra e avaliação técnica com uma visão de mercado mais clara.
          </h2>
          <p className="text-gray-300 text-lg mt-5 max-w-2xl mx-auto">
            Assine para acessar análises completas por versão, histórico colaborativo e camadas
            adicionais de leitura de risco.
          </p>

          <div className="mt-9 flex flex-wrap justify-center gap-4">
            <Link
              href="/assinatura"
              className="bg-white text-black px-7 py-3 rounded-lg font-medium hover:bg-gray-200 transition"
            >
              Conhecer assinatura
            </Link>
            <Link
              href="/carros"
              className="border border-white/70 px-7 py-3 rounded-lg font-medium hover:bg-white hover:text-black transition"
            >
              Explorar modelos
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
