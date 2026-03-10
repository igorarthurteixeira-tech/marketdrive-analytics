"use client"

import Image from "next/image"
import Link from "next/link"

type UserIdentityBadgeProps = {
  name: string
  profileId?: string | null
  avatarUrl?: string | null
  badgeText?: string | null
  size?: "sm" | "xs"
  disableProfileLink?: boolean
}

export default function UserIdentityBadge({
  name,
  profileId = null,
  avatarUrl = null,
  badgeText = null,
  size = "sm",
  disableProfileLink = false,
}: UserIdentityBadgeProps) {
  const avatarSize = size === "xs" ? 20 : 24
  const textClass = size === "xs" ? "text-xs" : "text-sm"
  const fallback = (name || "U").charAt(0).toUpperCase()

  const identity = (
    <>
      <span
        className="rounded-full border border-gray-300 bg-gray-100 overflow-hidden flex items-center justify-center shrink-0"
        style={{ width: avatarSize, height: avatarSize }}
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`Avatar de ${name}`}
            width={avatarSize}
            height={avatarSize}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className={`font-semibold text-gray-500 ${size === "xs" ? "text-[10px]" : "text-xs"}`}>
            {fallback}
          </span>
        )}
      </span>
      <span className={`${textClass} font-medium text-gray-700 whitespace-nowrap`}>{name}</span>
    </>
  )

  return (
    <div className="inline-flex items-center gap-1.5">
      {profileId && !disableProfileLink ? (
        <Link
          href={`/perfil/${profileId}`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap hover:opacity-85 transition-opacity"
        >
          {identity}
        </Link>
      ) : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{identity}</span>
      )}

      {badgeText ? <span className="text-xs text-gray-400">{badgeText}</span> : null}
    </div>
  )
}
