"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/AuthProvider"
import UserIdentityBadge from "@/components/UserIdentityBadge"
import { Newspaper, SquarePen } from "lucide-react"

const VEHICLE_STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"
const POSTS_STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/posts-media/"

type FeedPost = {
  id: string
  author_user_id: string
  type: "noticia" | "publicacao"
  title: string | null
  description: string
  media_path: string | null
  media_kind: "image" | "video" | null
  related_vehicle_version_id: string | null
  created_at: string
}

type ProfileRow = {
  id: string
  name: string | null
  username?: string | null
  avatar_url?: string | null
}

type VehicleVersionMini = {
  id: string
  slug: string
  year: number | null
  version_name: string | null
  image_url?: string | null
  vehicles:
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }[]
    | {
        name: string | null
        brands: { name: string | null }[] | { name: string | null } | null
      }
    | null
}

type HotDiscussion = {
  vehicleVersionId: string
  score: number
  comments: number
  votes: number
}

type WeeklyTop = {
  vehicleVersionId: string
  score: number
}

const toVehicleLabel = (version: VehicleVersionMini | null) => {
  if (!version) return "Versao"
  const vehicle = Array.isArray(version.vehicles) ? version.vehicles[0] : version.vehicles
  const brandData = Array.isArray(vehicle?.brands) ? vehicle.brands[0] : vehicle?.brands
  const brand = brandData?.name ?? ""
  const model = vehicle?.name ?? ""
  const versionName = version.version_name ?? ""
  const year = version.year ?? ""
  return [brand, model, versionName, year].filter(Boolean).join(" ")
}

const toPostMediaSrc = (mediaPath: string | null) => {
  if (!mediaPath) return null
  if (mediaPath.startsWith("http://") || mediaPath.startsWith("https://")) return mediaPath
  return `${POSTS_STORAGE_URL}${mediaPath}`
}

const toVehicleImageSrc = (imagePath: string | null | undefined) => {
  if (!imagePath) return null
  if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) return imagePath
  return `${VEHICLE_STORAGE_URL}${imagePath}`
}

export default function FeedPage() {
  const { session } = useAuth()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState("")
  const [postsEnabled, setPostsEnabled] = useState(true)

  const [posts, setPosts] = useState<FeedPost[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({})
  const [versionsById, setVersionsById] = useState<Record<string, VehicleVersionMini>>({})
  const [newVersions, setNewVersions] = useState<VehicleVersionMini[]>([])
  const [hotDiscussions, setHotDiscussions] = useState<HotDiscussion[]>([])
  const [weeklyTop, setWeeklyTop] = useState<WeeklyTop[]>([])

  useEffect(() => {
    const fetchFeed = async () => {
      setLoading(true)
      setErrorMessage("")

      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [versionsRes, commentsRes, commentVotesRes, positiveVotesRes, defectVotesRes, postsRes] =
        await Promise.all([
          supabase
            .from("vehicle_versions")
            .select(
              "id,slug,year,version_name,image_url,vehicles(name,brands(name))"
            )
            .order("created_at", { ascending: false })
            .limit(8),
          supabase
            .from("vehicle_comments")
            .select("id,vehicle_version_id,created_at")
            .gte("created_at", sevenDaysAgoIso),
          supabase
            .from("vehicle_comment_votes")
            .select("comment_id,created_at")
            .gte("created_at", sevenDaysAgoIso),
          supabase
            .from("positive_votes")
            .select("positive_id,created_at")
            .gte("created_at", sevenDaysAgoIso),
          supabase
            .from("defect_votes")
            .select("defect_id,created_at")
            .gte("created_at", sevenDaysAgoIso),
          supabase
            .from("user_posts")
            .select(
              "id,author_user_id,type,title,description,media_path,media_kind,related_vehicle_version_id,created_at"
            )
            .order("created_at", { ascending: false })
            .limit(30),
        ])

      const versions = (versionsRes.data as VehicleVersionMini[] | null) ?? []
      setNewVersions(versions.slice(0, 5))

      const versionsMap: Record<string, VehicleVersionMini> = {}
      for (const item of versions) versionsMap[item.id] = item

      const comments = (commentsRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []
      const commentVotes =
        (commentVotesRes.data as { comment_id: string }[] | null) ?? []

      const commentToVersion: Record<string, string> = {}
      const discussionByVersion: Record<string, { comments: number; votes: number }> = {}
      for (const comment of comments) {
        commentToVersion[comment.id] = comment.vehicle_version_id
        const current = discussionByVersion[comment.vehicle_version_id] ?? { comments: 0, votes: 0 }
        current.comments += 1
        discussionByVersion[comment.vehicle_version_id] = current
      }
      for (const vote of commentVotes) {
        const versionId = commentToVersion[vote.comment_id]
        if (!versionId) continue
        const current = discussionByVersion[versionId] ?? { comments: 0, votes: 0 }
        current.votes += 1
        discussionByVersion[versionId] = current
      }

      const hot = Object.entries(discussionByVersion)
        .map(([vehicleVersionId, stats]) => ({
          vehicleVersionId,
          comments: stats.comments,
          votes: stats.votes,
          score: stats.comments * 2 + stats.votes,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      setHotDiscussions(hot)

      const weeklyScoreByVersion: Record<string, number> = {}
      for (const item of hot) {
        weeklyScoreByVersion[item.vehicleVersionId] =
          (weeklyScoreByVersion[item.vehicleVersionId] ?? 0) + item.score
      }

      const positiveVotes =
        (positiveVotesRes.data as { positive_id: string }[] | null) ?? []
      const defectVotes =
        (defectVotesRes.data as { defect_id: string }[] | null) ?? []

      if (positiveVotes.length > 0) {
        const positiveIds = Array.from(new Set(positiveVotes.map((v) => v.positive_id)))
        const positivesRes = await supabase
          .from("positives")
          .select("id,vehicle_version_id")
          .in("id", positiveIds)
        for (const row of
          (positivesRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []) {
          const amount = positiveVotes.filter((vote) => vote.positive_id === row.id).length
          weeklyScoreByVersion[row.vehicle_version_id] =
            (weeklyScoreByVersion[row.vehicle_version_id] ?? 0) + amount
        }
      }

      if (defectVotes.length > 0) {
        const defectIds = Array.from(new Set(defectVotes.map((v) => v.defect_id)))
        const defectsRes = await supabase
          .from("defects")
          .select("id,vehicle_version_id")
          .in("id", defectIds)
        for (const row of
          (defectsRes.data as { id: string; vehicle_version_id: string }[] | null) ?? []) {
          const amount = defectVotes.filter((vote) => vote.defect_id === row.id).length
          weeklyScoreByVersion[row.vehicle_version_id] =
            (weeklyScoreByVersion[row.vehicle_version_id] ?? 0) + amount
        }
      }

      const top = Object.entries(weeklyScoreByVersion)
        .map(([vehicleVersionId, score]) => ({ vehicleVersionId, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      setWeeklyTop(top)

      const fetchedPosts = (postsRes.data as FeedPost[] | null) ?? []
      if (postsRes.error && /relation|table|schema cache|does not exist/i.test(postsRes.error.message ?? "")) {
        setPostsEnabled(false)
        setPosts([])
      } else {
        setPostsEnabled(true)
        setPosts(fetchedPosts)
      }

      const profileIds = Array.from(
        new Set(
          fetchedPosts.map((item) => item.author_user_id).filter(Boolean)
        )
      )
      if (profileIds.length > 0) {
        const profilesRes = await supabase
          .from("profiles")
          .select("id,name,username,avatar_url")
          .in("id", profileIds)
        const map: Record<string, ProfileRow> = {}
        for (const row of (profilesRes.data as ProfileRow[] | null) ?? []) {
          map[row.id] = row
        }
        setProfilesById(map)
      } else {
        setProfilesById({})
      }

      const versionIdsFromPosts = Array.from(
        new Set(
          fetchedPosts
            .map((item) => item.related_vehicle_version_id)
            .filter((id): id is string => Boolean(id))
        )
      )
      if (versionIdsFromPosts.length > 0) {
        const versionsFromPostsRes = await supabase
          .from("vehicle_versions")
          .select("id,slug,year,version_name,image_url,vehicles(name,brands(name))")
          .in("id", versionIdsFromPosts)
        for (const row of (versionsFromPostsRes.data as VehicleVersionMini[] | null) ?? []) {
          versionsMap[row.id] = row
        }
      }
      setVersionsById(versionsMap)
      setLoading(false)
    }

    void fetchFeed()
  }, [])

  const postCards = useMemo(() => {
    return posts.map((post) => {
      const author = profilesById[post.author_user_id]
      const version =
        post.related_vehicle_version_id ? versionsById[post.related_vehicle_version_id] ?? null : null
      return {
        post,
        authorName: author?.name ?? "Usuario",
        authorUsername: author?.username ?? null,
        authorAvatar: author?.avatar_url ?? null,
        relatedVersion: version,
      }
    })
  }, [posts, profilesById, versionsById])

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 md:px-8 pt-28 pb-16 space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feed</h1>
            <p className="mt-2 text-sm text-gray-600">
              Novos modelos, discussoes em alta e top da semana.
            </p>
          </div>
          {session?.user?.id ? (
            <Link
              href="/postagens/nova"
              className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 transition"
            >
              <SquarePen size={15} />
              Nova postagem
            </Link>
          ) : null}
        </div>
      </section>

      {errorMessage ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <article className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-gray-900">
            <Newspaper size={18} />
            Publicacoes da comunidade
          </h2>
          {!postsEnabled ? (
            <p className="mt-3 text-sm text-gray-600">
              Estrutura de postagens ainda nao disponivel no banco.
            </p>
          ) : null}

          {postsEnabled && !postCards.length ? (
            <p className="mt-3 text-sm text-gray-600">Nenhuma publicacao ainda.</p>
          ) : null}

          {postsEnabled && postCards.length ? (
            <div className="mt-4 space-y-4">
              {postCards.map((card) => {
                const mediaSrc = toPostMediaSrc(card.post.media_path)
                return (
                  <article key={card.post.id} className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <UserIdentityBadge
                        name={card.authorName}
                        profileId={card.post.author_user_id}
                        avatarUrl={card.authorAvatar}
                        size="sm"
                      />
                      <span className="text-xs text-gray-500">
                        {new Date(card.post.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>

                    <p className="mt-2 text-xs uppercase tracking-[0.08em] text-gray-500">
                      {card.post.type === "noticia" ? "Noticia" : "Publicacao"}
                      {card.authorUsername ? ` • @${card.authorUsername}` : ""}
                    </p>
                    {card.post.title ? (
                      <h3 className="mt-1 text-base font-semibold text-gray-900">{card.post.title}</h3>
                    ) : null}
                    <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{card.post.description}</p>

                    {mediaSrc && card.post.media_kind === "image" ? (
                      <div className="relative mt-3 h-72 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        <Image src={mediaSrc} alt="Midia da postagem" fill className="object-cover" />
                      </div>
                    ) : null}

                    {mediaSrc && card.post.media_kind === "video" ? (
                      <video
                        src={mediaSrc}
                        controls
                        className="mt-3 h-72 w-full rounded-lg border border-gray-200 bg-black object-cover"
                      />
                    ) : null}

                    {card.relatedVersion ? (
                      <Link
                        href={`/carros/${card.relatedVersion.slug}`}
                        className="mt-3 inline-block text-sm text-black underline underline-offset-4"
                      >
                        Relacionado: {toVehicleLabel(card.relatedVersion)}
                      </Link>
                    ) : null}
                  </article>
                )
              })}
            </div>
          ) : null}
        </article>

        <aside className="grid gap-4">
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm min-h-[250px]">
            <h3 className="text-lg font-semibold text-gray-900">Top da semana</h3>
            <p className="mt-1 text-xs text-gray-500">Atualizacao diaria (janela de 7 dias)</p>
            <div className="mt-3 space-y-2">
              {weeklyTop.map((item, index) => {
                const version = versionsById[item.vehicleVersionId] ?? null
                if (!version) return null
                const imageSrc = toVehicleImageSrc(version.image_url)
                return (
                  <Link
                    key={item.vehicleVersionId}
                    href={`/carros/${version.slug}`}
                    className="block rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500">#{index + 1}</span>
                      {imageSrc ? (
                        <div className="relative h-10 w-14 overflow-hidden rounded border border-gray-200 bg-gray-100">
                          <Image src={imageSrc} alt="Veiculo" fill className="object-cover" />
                        </div>
                      ) : null}
                      <div>
                        <p className="font-medium text-gray-900">{toVehicleLabel(version)}</p>
                        <p className="text-xs text-gray-600">Score: {item.score}</p>
                      </div>
                    </div>
                  </Link>
                )
              })}
              {!weeklyTop.length ? <p className="text-sm text-gray-600">Sem dados.</p> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm min-h-[250px]">
            <h3 className="text-lg font-semibold text-gray-900">Discussoes em alta</h3>
            <div className="mt-3 space-y-2">
              {hotDiscussions.map((item) => {
                const version = versionsById[item.vehicleVersionId] ?? null
                if (!version) return null
                return (
                  <Link
                    key={item.vehicleVersionId}
                    href={`/carros/${version.slug}`}
                    className="block rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <p className="font-medium text-gray-900">{toVehicleLabel(version)}</p>
                    <p className="text-xs text-gray-600">
                      {item.comments} comentarios • {item.votes} votos
                    </p>
                  </Link>
                )
              })}
              {!hotDiscussions.length ? <p className="text-sm text-gray-600">Sem dados.</p> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm min-h-[250px]">
            <h3 className="text-lg font-semibold text-gray-900">Novos modelos/versoes</h3>
            <div className="mt-3 space-y-2">
              {newVersions.map((version) => (
                <Link
                  key={version.id}
                  href={`/carros/${version.slug}`}
                  className="block rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  {toVehicleLabel(version)}
                </Link>
              ))}
              {!newVersions.length ? <p className="text-sm text-gray-600">Sem dados.</p> : null}
            </div>
          </article>
        </aside>
      </section>

      {loading ? (
        <section className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
          Carregando feed...
        </section>
      ) : null}
    </main>
  )
}
