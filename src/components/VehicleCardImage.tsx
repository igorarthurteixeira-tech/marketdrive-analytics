"use client"

import { useState } from "react"
import Image from "next/image"

const STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

export default function VehicleCardImage({
  src,
  alt
}: {
  src: string
  alt: string
}) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      className={`relative w-full aspect-3/2 overflow-hidden transition-opacity duration-300 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
    >
      <Image
        src={`${STORAGE_URL}${src}`}
        alt={alt}
        fill
        quality={100}
        className="object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
        onLoad={() => setLoaded(true)}
      />
    </div>

  )
}