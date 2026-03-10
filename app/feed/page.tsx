"use client"

import { useEffect, useMemo, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Check, MessageCircle, MessageSquareReply, Newspaper, Pencil, SquarePen, Trash2, X } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/AuthProvider"
import UserIdentityBadge from "@/components/UserIdentityBadge"

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

type PostVoteRow = {
  post_id: string
  user_id: string
  is_confirmed: boolean
}

type PostCommentRow = {
  id: string
  post_id: string
  user_id: string
  parent_comment_id: string | null
  content: string
  created_at: string
}

type PostVoteStats = {
  confirmed: number
  denied: number
  userVote: boolean | null
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
  const [postVotesEnabled, setPostVotesEnabled] = useState(true)
  const [postCommentsEnabled, setPostCommentsEnabled] = useState(true)
  const [submittingVotePostId, setSubmittingVotePostId] = useState<string | null>(null)
  const [submittingCommentPostId, setSubmittingCommentPostId] = useState<string | null>(null)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null)
  const [editDraftByCommentId, setEditDraftByCommentId] = useState<Record<string, string>>({})
  const [savingEditCommentId, setSavingEditCommentId] = useState<string | null>(null)

  const [posts, setPosts] = useState<FeedPost[]>([])
  const [profilesById, setProfilesById] = useState<Record<string, ProfileRow>>({})
  const [versionsById, setVersionsById] = useState<Record<string, VehicleVersionMini>>({})
  const [newVersions, setNewVersions] = useState<VehicleVersionMini[]>([])
  const [hotDiscussions, setHotDiscussions] = useState<HotDiscussion[]>([])
  const [weeklyTop, setWeeklyTop] = useState<WeeklyTop[]>([])
  const [postVotesByPost, setPostVotesByPost] = useState<Record<string, PostVoteStats>>({})
  const [postCommentsByPost, setPostCommentsByPost] = useState<Record<string, PostCommentRow[]>>({})
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<string, string>>({})
  const [replyDraftByComment, setReplyDraftByComment] = useState<Record<string, string>>({})
  const [activeReplyCommentIdByPost, setActiveReplyCommentIdByPost] = useState<Record<string, string | null>>({})
  const [visibleCommentsCountByPost, setVisibleCommentsCountByPost] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchFeed = async () => {
      setLoading(true)
      setErrorMessage("")

      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const [versionsRes, commentsRes, commentVotesRes, positiveVotesRes, defectVotesRes, postsRes] =
        await Promise.all([
          supabase
            .from("vehicle_versions")
            .select("id,slug,year,version_name,image_url,vehicles(name,brands(name))")
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
      const commentVotes = (commentVotesRes.data as { comment_id: string }[] | null) ?? []

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

      const positiveVotes = (positiveVotesRes.data as { positive_id: string }[] | null) ?? []
      const defectVotes = (defectVotesRes.data as { defect_id: string }[] | null) ?? []

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
      if (
        postsRes.error &&
        /relation|table|schema cache|does not exist/i.test(postsRes.error.message ?? "")
      ) {
        setPostsEnabled(false)
        setPosts([])
      } else {
        setPostsEnabled(true)
        setPosts(fetchedPosts)
      }

      const postIds = fetchedPosts.map((post) => post.id)

      let fetchedPostVotes: PostVoteRow[] = []
      if (postIds.length > 0) {
        const postVotesRes = await supabase
          .from("user_post_votes")
          .select("post_id,user_id,is_confirmed")
          .in("post_id", postIds)
        if (
          postVotesRes.error &&
          /relation|table|schema cache|does not exist/i.test(postVotesRes.error.message ?? "")
        ) {
          setPostVotesEnabled(false)
        } else {
          setPostVotesEnabled(true)
          fetchedPostVotes = (postVotesRes.data as PostVoteRow[] | null) ?? []
        }
      }

      let fetchedPostComments: PostCommentRow[] = []
      if (postIds.length > 0) {
        const postCommentsRes = await supabase
          .from("user_post_comments")
          .select("id,post_id,user_id,parent_comment_id,content,created_at")
          .in("post_id", postIds)
          .order("created_at", { ascending: false })
        if (
          postCommentsRes.error &&
          /relation|table|schema cache|does not exist/i.test(postCommentsRes.error.message ?? "")
        ) {
          setPostCommentsEnabled(false)
        } else {
          setPostCommentsEnabled(true)
          fetchedPostComments = (postCommentsRes.data as PostCommentRow[] | null) ?? []
        }
      }

      const voteStatsByPost: Record<string, PostVoteStats> = {}
      for (const postId of postIds) {
        voteStatsByPost[postId] = { confirmed: 0, denied: 0, userVote: null }
      }
      for (const vote of fetchedPostVotes) {
        const current = voteStatsByPost[vote.post_id] ?? { confirmed: 0, denied: 0, userVote: null }
        if (vote.is_confirmed) current.confirmed += 1
        else current.denied += 1
        if (session?.user?.id && vote.user_id === session.user.id) {
          current.userVote = vote.is_confirmed
        }
        voteStatsByPost[vote.post_id] = current
      }
      setPostVotesByPost(voteStatsByPost)

      const commentsByPost: Record<string, PostCommentRow[]> = {}
      for (const item of fetchedPostComments) {
        commentsByPost[item.post_id] = [...(commentsByPost[item.post_id] ?? []), item]
      }
      setPostCommentsByPost(commentsByPost)

      const profileIds = Array.from(
        new Set(
          [
            ...fetchedPosts.map((item) => item.author_user_id),
            ...fetchedPostComments.map((item) => item.user_id),
          ].filter(Boolean)
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
  }, [session?.user?.id])

  const voteOnPost = async (postId: string, isConfirmed: boolean) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para confirmar ou negar publicações.")
      return
    }
    if (!postVotesEnabled) {
      setErrorMessage("Votos em publicações ainda não foram habilitados no banco.")
      return
    }

    setSubmittingVotePostId(postId)
    setErrorMessage("")

    const current = postVotesByPost[postId]?.userVote ?? null
    const request =
      current === isConfirmed
        ? await supabase
            .from("user_post_votes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("user_post_votes")
            .upsert(
              { post_id: postId, user_id: session.user.id, is_confirmed: isConfirmed },
              { onConflict: "post_id,user_id" }
            )

    if (request.error) {
      setErrorMessage(`Falha ao registrar voto: ${request.error.message}`)
      setSubmittingVotePostId(null)
      return
    }

    setPostVotesByPost((prev) => {
      const stats = prev[postId] ?? { confirmed: 0, denied: 0, userVote: null }
      let confirmed = stats.confirmed
      let denied = stats.denied
      let userVote: boolean | null = stats.userVote

      if (stats.userVote === isConfirmed) {
        if (isConfirmed) confirmed = Math.max(0, confirmed - 1)
        else denied = Math.max(0, denied - 1)
        userVote = null
      } else if (stats.userVote === null) {
        if (isConfirmed) confirmed += 1
        else denied += 1
        userVote = isConfirmed
      } else {
        if (isConfirmed) {
          denied = Math.max(0, denied - 1)
          confirmed += 1
        } else {
          confirmed = Math.max(0, confirmed - 1)
          denied += 1
        }
        userVote = isConfirmed
      }

      return { ...prev, [postId]: { confirmed, denied, userVote } }
    })

    setSubmittingVotePostId(null)
  }

  const submitPostComment = async (postId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para comentar.")
      return
    }
    if (!postCommentsEnabled) {
      setErrorMessage("Comentários em publicações ainda não foram habilitados no banco.")
      return
    }

    const content = (commentDraftByPost[postId] ?? "").trim()
    if (!content) return

    setSubmittingCommentPostId(postId)
    setErrorMessage("")

    const insert = await supabase
      .from("user_post_comments")
      .insert({
        post_id: postId,
        user_id: session.user.id,
        content,
      })
      .select("id,post_id,user_id,parent_comment_id,content,created_at")
      .single()

    if (insert.error) {
      setErrorMessage(`Falha ao comentar: ${insert.error.message}`)
      setSubmittingCommentPostId(null)
      return
    }

    const newComment = insert.data as PostCommentRow
    setPostCommentsByPost((prev) => ({
      ...prev,
      [postId]: [newComment, ...(prev[postId] ?? [])],
    }))
    setCommentDraftByPost((prev) => ({ ...prev, [postId]: "" }))

    if (!profilesById[session.user.id]) {
      const meRes = await supabase
        .from("profiles")
        .select("id,name,username,avatar_url")
        .eq("id", session.user.id)
        .single()
      if (meRes.data) {
        const me = meRes.data as ProfileRow
        setProfilesById((prev) => ({ ...prev, [me.id]: me }))
      }
    }

    setSubmittingCommentPostId(null)
  }

  const submitPostReply = async (postId: string, parentCommentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("FaÃ§a login para responder.")
      return
    }
    if (!postCommentsEnabled) {
      setErrorMessage("ComentÃ¡rios em publicaÃ§Ãµes ainda nÃ£o foram habilitados no banco.")
      return
    }

    const content = (replyDraftByComment[parentCommentId] ?? "").trim()
    if (!content) return

    setSubmittingCommentPostId(postId)
    setErrorMessage("")

    const insert = await supabase
      .from("user_post_comments")
      .insert({
        post_id: postId,
        user_id: session.user.id,
        parent_comment_id: parentCommentId,
        content,
      })
      .select("id,post_id,user_id,parent_comment_id,content,created_at")
      .single()

    if (insert.error) {
      setErrorMessage(`Falha ao responder: ${insert.error.message}`)
      setSubmittingCommentPostId(null)
      return
    }

    const newComment = insert.data as PostCommentRow
    setPostCommentsByPost((prev) => ({
      ...prev,
      [postId]: [newComment, ...(prev[postId] ?? [])],
    }))
    setReplyDraftByComment((prev) => ({ ...prev, [parentCommentId]: "" }))
    setActiveReplyCommentIdByPost((prev) => ({ ...prev, [postId]: null }))

    if (!profilesById[session.user.id]) {
      const meRes = await supabase
        .from("profiles")
        .select("id,name,username,avatar_url")
        .eq("id", session.user.id)
        .single()
      if (meRes.data) {
        const me = meRes.data as ProfileRow
        setProfilesById((prev) => ({ ...prev, [me.id]: me }))
      }
    }

    setSubmittingCommentPostId(null)
  }

  const deletePostComment = async (postId: string, commentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para excluir comentários.")
      return
    }

    setDeletingCommentId(commentId)
    setErrorMessage("")

    const request = await supabase
      .from("user_post_comments")
      .delete()
      .eq("id", commentId)
      .eq("user_id", session.user.id)

    if (request.error) {
      setErrorMessage(`Falha ao excluir comentário: ${request.error.message}`)
      setDeletingCommentId(null)
      return
    }

    setPostCommentsByPost((prev) => {
      const current = prev[postId] ?? []
      if (!current.length) return prev

      const byParent = current.reduce<Record<string, string[]>>((acc, item) => {
        const parentId = item.parent_comment_id
        if (!parentId) return acc
        acc[parentId] = [...(acc[parentId] ?? []), item.id]
        return acc
      }, {})

      const toRemove = new Set<string>()
      const stack = [commentId]
      while (stack.length > 0) {
        const id = stack.pop()
        if (!id || toRemove.has(id)) continue
        toRemove.add(id)
        const children = byParent[id] ?? []
        for (const childId of children) stack.push(childId)
      }

      return {
        ...prev,
        [postId]: current.filter((item) => !toRemove.has(item.id)),
      }
    })

    setDeletingCommentId(null)
  }

  const saveEditedComment = async (postId: string, commentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para editar comentários.")
      return
    }

    const content = (editDraftByCommentId[commentId] ?? "").trim()
    if (!content) {
      setErrorMessage("Comentário não pode ficar vazio.")
      return
    }

    setSavingEditCommentId(commentId)
    setErrorMessage("")

    const request = await supabase
      .from("user_post_comments")
      .update({ content })
      .eq("id", commentId)
      .eq("user_id", session.user.id)

    if (request.error) {
      setErrorMessage(`Falha ao editar comentário: ${request.error.message}`)
      setSavingEditCommentId(null)
      return
    }

    setPostCommentsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? []).map((item) => (item.id === commentId ? { ...item, content } : item)),
    }))

    setEditingCommentId(null)
    setSavingEditCommentId(null)
  }

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
                const voteStats = postVotesByPost[card.post.id] ?? {
                  confirmed: 0,
                  denied: 0,
                  userVote: null,
                }
                const postComments = postCommentsByPost[card.post.id] ?? []
                const visibleCount = visibleCommentsCountByPost[card.post.id] ?? 0
                const parentComments = postComments.filter((item) => !item.parent_comment_id)
                const visibleComments = parentComments.slice(0, visibleCount)
                const repliesByParent = postComments.reduce<Record<string, PostCommentRow[]>>((acc, item) => {
                  if (!item.parent_comment_id) return acc
                  acc[item.parent_comment_id] = [...(acc[item.parent_comment_id] ?? []), item]
                  return acc
                }, {})
                const activeReplyCommentId = activeReplyCommentIdByPost[card.post.id] ?? null
                const remainingComments = Math.max(0, parentComments.length - visibleComments.length)
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
                      {card.authorUsername ? ` - @${card.authorUsername}` : ""}
                    </p>
                    {card.post.title ? (
                      <h3 className="mt-1 text-lg font-semibold text-gray-900">{card.post.title}</h3>
                    ) : null}

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

                    <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">
                      {card.post.description}
                    </p>

                    {card.relatedVersion ? (
                      <Link
                        href={`/carros/${card.relatedVersion.slug}`}
                        className="mt-3 inline-block text-sm text-black underline underline-offset-4"
                      >
                        Relacionado: {toVehicleLabel(card.relatedVersion)}
                      </Link>
                    ) : null}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void voteOnPost(card.post.id, true)}
                        disabled={!postVotesEnabled || submittingVotePostId === card.post.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-60 ${
                          voteStats.userVote === true
                            ? "bg-green-600 border-green-600 text-white"
                            : "border-green-300 text-green-700 hover:bg-green-50"
                        }`}
                      >
                        <Check size={14} />
                        {voteStats.confirmed}
                      </button>
                      <button
                        type="button"
                        onClick={() => void voteOnPost(card.post.id, false)}
                        disabled={!postVotesEnabled || submittingVotePostId === card.post.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-60 ${
                          voteStats.userVote === false
                            ? "bg-red-600 border-red-600 text-white"
                            : "border-red-300 text-red-700 hover:bg-red-50"
                        }`}
                      >
                        <X size={14} />
                        {voteStats.denied}
                      </button>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 bg-gray-50">
                        <MessageCircle size={14} />
                        {postComments.length}
                      </span>
                    </div>

                    <div className="mt-3 border-t border-gray-200 pt-3 space-y-2">
                      {!postCommentsEnabled ? (
                        <p className="text-xs text-gray-500">
                          Comentarios em publicacoes ainda nao foram habilitados no banco.
                        </p>
                      ) : null}

                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={commentDraftByPost[card.post.id] ?? ""}
                          onChange={(event) =>
                            setCommentDraftByPost((prev) => ({
                              ...prev,
                              [card.post.id]: event.target.value,
                            }))
                          }
                          placeholder="Comentar publicacao..."
                          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => void submitPostComment(card.post.id)}
                          disabled={!postCommentsEnabled || submittingCommentPostId === card.post.id}
                          className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                        >
                          Enviar
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={parentComments.length === 0}
                        onClick={() => {
                          if (visibleCount === 0) {
                            setVisibleCommentsCountByPost((prev) => ({
                              ...prev,
                              [card.post.id]: 8,
                            }))
                            return
                          }
                          if (remainingComments > 0) {
                            setVisibleCommentsCountByPost((prev) => ({
                              ...prev,
                              [card.post.id]: visibleCount + 8,
                            }))
                            return
                          }
                          setVisibleCommentsCountByPost((prev) => ({
                            ...prev,
                            [card.post.id]: 0,
                          }))
                        }}
                        className="text-xs text-gray-600 hover:text-black underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {visibleCount === 0
                          ? `Exibir comentarios (${parentComments.length})`
                          : remainingComments > 0
                            ? `Exibir mais 8 comentarios (${remainingComments} restantes)`
                            : "Ocultar comentarios"}
                      </button>

                      {visibleComments.map((comment) => {
                        const profile = profilesById[comment.user_id]
                        const replies = repliesByParent[comment.id] ?? []
                        return (
                          <div key={comment.id} className="rounded-md bg-gray-50 p-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <UserIdentityBadge
                                name={profile?.name ?? "Usuario"}
                                profileId={comment.user_id}
                                avatarUrl={profile?.avatar_url ?? null}
                                size="xs"
                              />
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-gray-500">
                                  {new Date(comment.created_at).toLocaleDateString("pt-BR")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveReplyCommentIdByPost((prev) => ({
                                      ...prev,
                                      [card.post.id]: activeReplyCommentId === comment.id ? null : comment.id,
                                    }))
                                  }
                                  title="Responder"
                                  aria-label="Responder"
                                  className="inline-flex items-center text-gray-600 hover:text-black"
                                >
                                  <MessageSquareReply size={14} />
                                </button>
                                {session?.user?.id === comment.user_id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(comment.id)
                                      setEditDraftByCommentId((prev) => ({
                                        ...prev,
                                        [comment.id]: comment.content,
                                      }))
                                    }}
                                    title="Editar"
                                    aria-label="Editar"
                                    className="inline-flex items-center text-gray-600 hover:text-black"
                                  >
                                    <Pencil size={13} />
                                  </button>
                                ) : null}
                                {session?.user?.id === comment.user_id ? (
                                  <button
                                    type="button"
                                    onClick={() => void deletePostComment(card.post.id, comment.id)}
                                    disabled={deletingCommentId === comment.id}
                                    title="Excluir"
                                    aria-label="Excluir"
                                    className="inline-flex items-center text-red-600 hover:text-red-700 disabled:opacity-60"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                            {editingCommentId === comment.id ? (
                              <div className="mt-2 space-y-2">
                                <input
                                  type="text"
                                  value={editDraftByCommentId[comment.id] ?? comment.content}
                                  onChange={(event) =>
                                    setEditDraftByCommentId((prev) => ({
                                      ...prev,
                                      [comment.id]: event.target.value,
                                    }))
                                  }
                                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                />
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void saveEditedComment(card.post.id, comment.id)}
                                    disabled={savingEditCommentId === comment.id}
                                    className="text-xs text-black underline underline-offset-2 hover:text-gray-700 disabled:opacity-60"
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingCommentId(null)}
                                    className="text-xs text-gray-600 underline underline-offset-2 hover:text-black"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p className="mt-1 text-sm text-gray-800">{comment.content}</p>
                            )}
                            {activeReplyCommentId === comment.id ? (
                              <div className="mt-2 flex items-center gap-2">
                                <input
                                  type="text"
                                  value={replyDraftByComment[comment.id] ?? ""}
                                  onChange={(event) =>
                                    setReplyDraftByComment((prev) => ({
                                      ...prev,
                                      [comment.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Responder comentario..."
                                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs"
                                />
                                <button
                                  type="button"
                                  onClick={() => void submitPostReply(card.post.id, comment.id)}
                                  disabled={!postCommentsEnabled || submittingCommentPostId === card.post.id}
                                  className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                                >
                                  Enviar
                                </button>
                              </div>
                            ) : null}

                            {replies.length > 0 ? (
                              <div className="mt-2 space-y-2 border-l border-gray-200 pl-3">
                                {replies.map((reply) => {
                                  const replyProfile = profilesById[reply.user_id]
                                  return (
                                    <div key={reply.id} className="rounded-md bg-white p-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <UserIdentityBadge
                                          name={replyProfile?.name ?? "Usuario"}
                                          profileId={reply.user_id}
                                          avatarUrl={replyProfile?.avatar_url ?? null}
                                          size="xs"
                                        />
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] text-gray-500">
                                            {new Date(reply.created_at).toLocaleDateString("pt-BR")}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveReplyCommentIdByPost((prev) => ({
                                                ...prev,
                                                [card.post.id]:
                                                  activeReplyCommentId === reply.id ? null : reply.id,
                                              }))
                                            }
                                            title="Responder"
                                            aria-label="Responder"
                                            className="inline-flex items-center text-gray-600 hover:text-black"
                                          >
                                            <MessageSquareReply size={12} />
                                          </button>
                                          {session?.user?.id === reply.user_id ? (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setEditingCommentId(reply.id)
                                                setEditDraftByCommentId((prev) => ({
                                                  ...prev,
                                                  [reply.id]: reply.content,
                                                }))
                                              }}
                                              title="Editar"
                                              aria-label="Editar"
                                              className="inline-flex items-center text-gray-600 hover:text-black"
                                            >
                                              <Pencil size={12} />
                                            </button>
                                          ) : null}
                                          {session?.user?.id === reply.user_id ? (
                                            <button
                                              type="button"
                                              onClick={() => void deletePostComment(card.post.id, reply.id)}
                                              disabled={deletingCommentId === reply.id}
                                              title="Excluir"
                                              aria-label="Excluir"
                                              className="inline-flex items-center text-red-600 hover:text-red-700 disabled:opacity-60"
                                            >
                                              <Trash2 size={12} />
                                            </button>
                                          ) : null}
                                        </div>
                                      </div>
                                      {editingCommentId === reply.id ? (
                                        <div className="mt-2 space-y-2">
                                          <input
                                            type="text"
                                            value={editDraftByCommentId[reply.id] ?? reply.content}
                                            onChange={(event) =>
                                              setEditDraftByCommentId((prev) => ({
                                                ...prev,
                                                [reply.id]: event.target.value,
                                              }))
                                            }
                                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs"
                                          />
                                          <div className="flex items-center gap-3">
                                            <button
                                              type="button"
                                              onClick={() => void saveEditedComment(card.post.id, reply.id)}
                                              disabled={savingEditCommentId === reply.id}
                                              className="text-[11px] text-black underline underline-offset-2 hover:text-gray-700 disabled:opacity-60"
                                            >
                                              Salvar
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setEditingCommentId(null)}
                                              className="text-[11px] text-gray-600 underline underline-offset-2 hover:text-black"
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <p className="mt-1 text-xs text-gray-800">{reply.content}</p>
                                      )}
                                      {activeReplyCommentId === reply.id ? (
                                        <div className="mt-2 flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={replyDraftByComment[reply.id] ?? ""}
                                            onChange={(event) =>
                                              setReplyDraftByComment((prev) => ({
                                                ...prev,
                                                [reply.id]: event.target.value,
                                              }))
                                            }
                                            placeholder="Responder comentario..."
                                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-xs"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => void submitPostReply(card.post.id, reply.id)}
                                            disabled={
                                              !postCommentsEnabled ||
                                              submittingCommentPostId === card.post.id
                                            }
                                            className="rounded-lg bg-black px-3 py-2 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60"
                                          >
                                            Enviar
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
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
                      {item.comments} comentarios - {item.votes} votos
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
