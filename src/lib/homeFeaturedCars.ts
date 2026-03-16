import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MAX_HOME_CARDS = 5

type VersionRow = {
  id: string
  slug: string
  created_by?: string | null
  year: number | null
  image_url: string | null
  home_featured?: boolean | null
  home_featured_order?: number | null
  vehicles:
    | {
        name: string | null
        image_url?: string | null
        brands:
          | { name: string | null; logo_path?: string | null }[]
          | { name: string | null; logo_path?: string | null }
          | null
      }[]
    | {
        name: string | null
        image_url?: string | null
        brands:
          | { name: string | null; logo_path?: string | null }[]
          | { name: string | null; logo_path?: string | null }
          | null
      }
    | null
}

type CountRow = {
  vehicle_version_id: string | null
}

type PositiveRow = {
  id: string
  vehicle_version_id: string
  description: string
}

type PositiveVoteRow = {
  positive_id: string
  is_confirmed: boolean
}

type RatingRow = {
  vehicle_version_id: string
  rating: number
}

export type HomeCar = {
  id: string
  slug: string
  name: string
  brandName: string
  brandLogoUrl: string | null
  image: string | null
  authorId: string | null
  authorName: string
  authorAvatarUrl: string | null
  rating: number | null
  ratingCount: number
  topPositive: string | null
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
  if (logoPath && logoPath.trim()) return `/brands/${logoPath.trim()}`
  const slug = toBrandSlug(brandName)
  return slug ? `/brands/${slug}.png` : null
}

function toCard(
  version: VersionRow,
  meta?: { rating?: number | null; ratingCount?: number; topPositive?: string | null },
  authorName?: string,
  authorAvatarUrl?: string | null
): HomeCar {
  const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
  const brand = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands

  return {
    id: version.id,
    slug: version.slug,
    name: `${brand?.name ?? ""} ${vehicle?.name ?? ""} ${version.year ?? ""}`.trim(),
    brandName: brand?.name ?? "",
    brandLogoUrl: toBrandLogoSrc(brand?.logo_path, brand?.name ?? ""),
    image: version.image_url ?? vehicle?.image_url ?? null,
    authorId: version.created_by ?? null,
    authorName: authorName ?? "Autor da comunidade",
    authorAvatarUrl: authorAvatarUrl ?? null,
    rating: meta?.rating ?? null,
    ratingCount: meta?.ratingCount ?? 0,
    topPositive: meta?.topPositive ?? null,
  }
}

function buildCountMap(rows: CountRow[] | null): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const row of rows ?? []) {
    if (!row.vehicle_version_id) continue
    counts[row.vehicle_version_id] = (counts[row.vehicle_version_id] ?? 0) + 1
  }
  return counts
}

async function enrichCards(selected: VersionRow[]): Promise<HomeCar[]> {
  if (!selected.length) return []

  const versionIds = selected.map((version) => version.id)
  const authorIds = Array.from(
    new Set(selected.map((version) => version.created_by).filter((id): id is string => Boolean(id)))
  )
  const authorMap: Record<string, string> = {}
  const authorAvatarMap: Record<string, string | null> = {}
  if (authorIds.length > 0) {
    const profilesRes = await supabase
      .from("profiles")
      .select("id,name,avatar_url")
      .in("id", authorIds)
    for (const row of ((profilesRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? [])) {
      authorMap[row.id] = row.name ?? "Autor da comunidade"
      authorAvatarMap[row.id] = row.avatar_url ?? null
    }
  }
  const ratingByVersion: Record<string, { total: number; sum: number }> = {}

  const ratingsRes = await supabase
    .from("vehicle_version_ratings")
    .select("vehicle_version_id,rating")
    .in("vehicle_version_id", versionIds)

  if (!ratingsRes.error) {
    for (const row of (ratingsRes.data as RatingRow[] | null) ?? []) {
      const current = ratingByVersion[row.vehicle_version_id] ?? { total: 0, sum: 0 }
      current.total += 1
      current.sum += row.rating
      ratingByVersion[row.vehicle_version_id] = current
    }
  }

  const positivesRes = await supabase
    .from("positives")
    .select("id,vehicle_version_id,description")
    .in("vehicle_version_id", versionIds)

  const positives = (positivesRes.data as PositiveRow[] | null) ?? []
  const positiveIds = positives.map((positive) => positive.id)

  const votesRes =
    positiveIds.length > 0
      ? await supabase
          .from("positive_votes")
          .select("positive_id,is_confirmed")
          .in("positive_id", positiveIds)
      : { data: [] as PositiveVoteRow[] }

  const votes = (votesRes.data as PositiveVoteRow[] | null) ?? []

  const positiveVotesMap: Record<string, { total: number; confirmed: number }> = {}
  for (const vote of votes) {
    const current = positiveVotesMap[vote.positive_id] ?? { total: 0, confirmed: 0 }
    current.total += 1
    if (vote.is_confirmed) current.confirmed += 1
    positiveVotesMap[vote.positive_id] = current
  }

  const positivesByVersion: Record<string, PositiveRow[]> = {}
  for (const positive of positives) {
    positivesByVersion[positive.vehicle_version_id] = [
      ...(positivesByVersion[positive.vehicle_version_id] ?? []),
      positive,
    ]
  }

  const metaByVersion: Record<string, { rating: number | null; ratingCount: number; topPositive: string | null }> = {}
  for (const version of selected) {
    const points = positivesByVersion[version.id] ?? []
    const versionRatingStats = ratingByVersion[version.id]
    const rating =
      versionRatingStats && versionRatingStats.total > 0
        ? Number((versionRatingStats.sum / versionRatingStats.total).toFixed(1))
        : null
    const ratingCount = versionRatingStats?.total ?? 0

    const rankedPoints = [...points].sort((a, b) => {
      const statsA = positiveVotesMap[a.id]?.total ?? 0
      const statsB = positiveVotesMap[b.id]?.total ?? 0
      if (statsA !== statsB) return statsB - statsA
      const confA = positiveVotesMap[a.id]?.confirmed ?? 0
      const confB = positiveVotesMap[b.id]?.confirmed ?? 0
      return confB - confA
    })

    metaByVersion[version.id] = {
      rating,
      ratingCount,
      topPositive: rankedPoints[0]?.description ?? null,
    }
  }

  return selected.map((version) =>
    toCard(
      version,
      metaByVersion[version.id],
      version.created_by ? authorMap[version.created_by] ?? "Autor da comunidade" : "Autor da comunidade",
      version.created_by ? authorAvatarMap[version.created_by] ?? null : null
    )
  )
}

export async function getHomeFeaturedCars(): Promise<HomeCar[]> {
  const selectWithFeatured = `
    id,
    slug,
    created_by,
    year,
    image_url,
    home_featured,
    home_featured_order,
    vehicles (
      name,
      image_url,
      brands ( name, logo_path )
    )
  `

  const selectFallback = `
    id,
    slug,
    created_by,
    year,
    image_url,
    vehicles (
      name,
      image_url,
      brands ( name, logo_path )
    )
  `

  const initial = await supabase
    .from("vehicle_versions")
    .select(selectWithFeatured)
    .order("year", { ascending: false })

  let versions = initial.data as VersionRow[] | null
  let error = initial.error

  // Backward compatibility when featured columns are not yet present.
  if (error && /column|schema cache/i.test(error.message ?? "")) {
    const fallback = await supabase
      .from("vehicle_versions")
      .select(selectFallback)
      .order("year", { ascending: false })

    versions = fallback.data as VersionRow[] | null
    error = fallback.error
  }

  if (error || !versions?.length) return []

  const fixed = versions
    .filter((version) => version.home_featured === true)
    .sort((a, b) => {
      const orderA = a.home_featured_order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.home_featured_order ?? Number.MAX_SAFE_INTEGER
      if (orderA !== orderB) return orderA - orderB
      return (b.year ?? 0) - (a.year ?? 0)
    })

  const fixedIds = new Set(fixed.map((version) => version.id))
  const available = versions.filter((version) => !fixedIds.has(version.id))

  if (fixed.length >= MAX_HOME_CARDS) {
    return enrichCards(fixed.slice(0, MAX_HOME_CARDS))
  }

  const [commentsRes, positivesRes, defectsRes] = await Promise.all([
    supabase.from("vehicle_comments").select("vehicle_version_id"),
    supabase.from("positives").select("vehicle_version_id"),
    supabase.from("defects").select("vehicle_version_id"),
  ])

  const commentsCount = buildCountMap(commentsRes.data as CountRow[] | null)
  const positivesCount = buildCountMap(positivesRes.data as CountRow[] | null)
  const defectsCount = buildCountMap(defectsRes.data as CountRow[] | null)

  // Popularity score balances community engagement and amount of structured data.
  const sortedByPopularity = [...available].sort((a, b) => {
    const scoreA =
      (commentsCount[a.id] ?? 0) * 4 +
      (positivesCount[a.id] ?? 0) * 3 +
      (defectsCount[a.id] ?? 0)
    const scoreB =
      (commentsCount[b.id] ?? 0) * 4 +
      (positivesCount[b.id] ?? 0) * 3 +
      (defectsCount[b.id] ?? 0)

    if (scoreA !== scoreB) return scoreB - scoreA
    return (b.year ?? 0) - (a.year ?? 0)
  })

  const selected = [...fixed, ...sortedByPopularity].slice(0, MAX_HOME_CARDS)
  return enrichCards(selected)
}
