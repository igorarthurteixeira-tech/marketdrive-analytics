"use client"

import { useState } from "react"

type BrandLogoProps = {
  src: string | null
  brandName: string
  className?: string
}

export default function BrandLogo({ src, brandName, className = "h-5 w-5" }: BrandLogoProps) {
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const loaded = Boolean(src) && loadedSrc === src
  const failed = !src || failedSrc === src

  if (!src || failed) {
    return (
      <span
        className={`${className} inline-flex items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600`}
        aria-label={`Sem logo da marca ${brandName}`}
      >
        {(brandName || "?").charAt(0).toUpperCase()}
      </span>
    )
  }

  return (
    <span className={`${className} relative inline-flex items-center justify-center`}>
      {!loaded ? (
        <span
          className="absolute inset-0 rounded-full bg-gray-200 animate-pulse"
          aria-hidden
        />
      ) : null}
      <img
        src={src}
        alt={`Logo ${brandName}`}
        className={`${className} object-contain transition-opacity duration-200 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
        loading="lazy"
        onLoad={() => {
          if (!src) return
          setLoadedSrc(src)
        }}
        onError={() => {
          if (!src) return
          setFailedSrc(src)
        }}
      />
    </span>
  )
}
