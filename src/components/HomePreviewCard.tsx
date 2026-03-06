import Image from "next/image"
import Link from "next/link"

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

type HomePreviewCardProps = {
  slug: string
  name: string
  image: string | null
}

export default function HomePreviewCard({ slug, name, image }: HomePreviewCardProps) {
  const imageSrc = image
    ? image.startsWith("http")
      ? image
      : `${STORAGE_URL}${image}`
    : null

  return (
    <Link
      href={`/carros/${slug}`}
      className="w-80 border rounded-xl overflow-hidden hover:shadow-lg transition"
    >

      {imageSrc && (
        <div className="relative w-full h-48">
          <Image
            src={imageSrc}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 320px"
          />
        </div>
      )}

      <div className="p-6">
        <h3 className="text-lg font-semibold">
          {name}
        </h3>
      </div>

    </Link>
  )
}
