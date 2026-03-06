import Image from "next/image"
import Link from "next/link"
import StarRating from "@/components/ui/StarRating"

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

type HomePreviewCardProps = {
  slug: string
  name: string
  image: string | null
  rating: number | null
  ratingCount: number
  topPositive: string | null
}

export default function HomePreviewCard({
  slug,
  name,
  image,
  rating,
  ratingCount,
  topPositive,
}: HomePreviewCardProps) {
  const hasRatings = ratingCount >= 1
  const displayRating = hasRatings ? (rating ?? 0) : 0

  const imageSrc = image
    ? image.startsWith("http")
      ? image
      : `${STORAGE_URL}${image}`
    : null

  return (
    <Link
      href={`/carros/${slug}`}
      className="group relative w-80 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-2xl"
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 via-white/0 to-white/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {imageSrc && (
        <div className="relative h-48 w-full overflow-hidden">
          <Image
            src={imageSrc}
            alt={name}
            fill
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 320px"
          />
        </div>
      )}

      <div className="p-6">
        <h3 className="text-lg font-semibold transition-colors duration-300 group-hover:text-red-700">
          {name}
        </h3>

        <div className="mt-3">
          <StarRating rating={displayRating} showValue={hasRatings} />
          <p className="mt-1 text-xs text-gray-500">
            {hasRatings
              ? `${ratingCount} ${ratingCount === 1 ? "avaliação" : "avaliações"}`
              : "Ainda não há avaliações suficientes para este modelo."}
          </p>
        </div>

        <p className="mt-3 text-sm text-gray-600 line-clamp-2">
          <span className="font-medium text-gray-800">Ponto em destaque:</span>{" "}
          {topPositive ?? "Comunidade em crescimento para este modelo."}
        </p>
      </div>

    </Link>
  )
}
