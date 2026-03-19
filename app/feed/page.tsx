"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Check, ChevronDown, ChevronUp, Eye, Flag, MessageCircle, MessageSquareReply, Newspaper, Pause, Pencil, Play, SquarePen, Trash2, Volume2, VolumeX, X } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/components/AuthProvider"
import UserIdentityBadge from "@/components/UserIdentityBadge"
import {
  MODERATION_REASON_OPTIONS,
  MODERATION_STATUS_LABEL,
  type ModerationContentType,
  type ModerationReason,
} from "@/lib/moderation"

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
  moderation_state?: "public" | "interim_suspended" | "suspended" | "suspended_revision" | "scheduled_delete"
}

type ProfileRow = {
  id: string
  name: string | null
  username?: string | null
  avatar_url?: string | null
  is_consultant_verified?: boolean | null
  is_founder?: boolean | null
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

type PostViewRow = {
  post_id: string
  user_id: string
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
  const [infoMessage, setInfoMessage] = useState("")
  const [feedFilter, setFeedFilter] = useState<"all" | "following">("all")
  const [sortMode, setSortMode] = useState<"recent" | "relevant">("recent")
  const [followsEnabled, setFollowsEnabled] = useState(true)
  const [followingIds, setFollowingIds] = useState<string[]>([])
  const [postsEnabled, setPostsEnabled] = useState(true)
  const [postVotesEnabled, setPostVotesEnabled] = useState(true)
  const [postCommentsEnabled, setPostCommentsEnabled] = useState(true)
  const [postViewsEnabled, setPostViewsEnabled] = useState(true)
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
  const [postViewsByPost, setPostViewsByPost] = useState<Record<string, number>>({})
  const [postCommentsByPost, setPostCommentsByPost] = useState<Record<string, PostCommentRow[]>>({})
  const [commentDraftByPost, setCommentDraftByPost] = useState<Record<string, string>>({})
  const [replyDraftByComment, setReplyDraftByComment] = useState<Record<string, string>>({})
  const [activeReplyCommentIdByPost, setActiveReplyCommentIdByPost] = useState<Record<string, string | null>>({})
  const [visibleCommentsCountByPost, setVisibleCommentsCountByPost] = useState<Record<string, number>>({})
  const [expandedDescriptionByPost, setExpandedDescriptionByPost] = useState<Record<string, boolean>>({})
  const [videoSequenceOpen, setVideoSequenceOpen] = useState(false)
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const [isSequenceMuted, setIsSequenceMuted] = useState(true)
  const [sequenceVolume, setSequenceVolume] = useState(0.6)
  const [isSequencePlaying, setIsSequencePlaying] = useState(true)
  const [sequenceProgress, setSequenceProgress] = useState(0)
  const [isVideoSwitching, setIsVideoSwitching] = useState(false)
  const [hiddenPostIds, setHiddenPostIds] = useState<string[]>([])
  const sequenceVideoRef = useRef<HTMLVideoElement | null>(null)
  const autoOpenedPistoes = useRef(false)
  const videoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const viewedPostIdsRef = useRef<Set<string>>(new Set())
  const postCardElementsRef = useRef<Record<string, HTMLElement | null>>({})
  const pendingPostViewTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [reportTarget, setReportTarget] = useState<{
    contentType: ModerationContentType
    contentId: string
    label: string
  } | null>(null)
  const [reportReason, setReportReason] = useState<ModerationReason>("spam")
  const [reportDetails, setReportDetails] = useState("")
  const [submittingReport, setSubmittingReport] = useState(false)

  useEffect(() => {
    const fetchFeed = async () => {
      setLoading(true)
      setErrorMessage("")
      setInfoMessage("")

      const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

      const moderationMaintenanceRes = await supabase.rpc("moderation_process_due_post_actions")
      if (
        moderationMaintenanceRes.error &&
        !/function|schema cache|does not exist/i.test(moderationMaintenanceRes.error.message ?? "")
      ) {
        setErrorMessage(`Falha ao processar ações de moderação: ${moderationMaintenanceRes.error.message}`)
      }

      if (session?.user?.id) {
        const followsRes = await supabase
          .from("user_follows")
          .select("following_id")
          .eq("follower_id", session.user.id)

        if (followsRes.error && /relation|table|schema cache|does not exist/i.test(followsRes.error.message ?? "")) {
          setFollowsEnabled(false)
          setFollowingIds([])
        } else if (followsRes.error) {
          setFollowsEnabled(true)
          setFollowingIds([])
          setErrorMessage(`Falha ao carregar seguidores: ${followsRes.error.message}`)
        } else {
          setFollowsEnabled(true)
          const ids = Array.from(
            new Set(
              ((followsRes.data as { following_id: string }[] | null) ?? [])
                .map((row) => row.following_id)
                .filter(Boolean)
                .concat(session.user.id)
            )
          )
          setFollowingIds(ids)
        }
      } else {
        setFollowsEnabled(true)
        setFollowingIds([])
      }

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
              "id,author_user_id,type,title,description,media_path,media_kind,related_vehicle_version_id,created_at,moderation_state"
            )
            .eq("moderation_state", "public")
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

      let fetchedPostViews: PostViewRow[] = []
      if (postIds.length > 0) {
        const postViewsRes = await supabase
          .from("user_post_views")
          .select("post_id,user_id")
          .in("post_id", postIds)
        if (
          postViewsRes.error &&
          /relation|table|schema cache|does not exist/i.test(postViewsRes.error.message ?? "")
        ) {
          setPostViewsEnabled(false)
        } else {
          setPostViewsEnabled(true)
          fetchedPostViews = (postViewsRes.data as PostViewRow[] | null) ?? []
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

      const viewsByPost: Record<string, number> = {}
      for (const postId of postIds) {
        viewsByPost[postId] = 0
      }
      for (const row of fetchedPostViews) {
        viewsByPost[row.post_id] = (viewsByPost[row.post_id] ?? 0) + 1
      }
      setPostViewsByPost(viewsByPost)
      if (session?.user?.id) {
        const mine = fetchedPostViews
          .filter((row) => row.user_id === session.user.id)
          .map((row) => row.post_id)
        viewedPostIdsRef.current = new Set(mine)
      } else {
        viewedPostIdsRef.current = new Set()
      }

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
          .select("id,name,username,avatar_url,is_consultant_verified,is_founder")
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

  const effectiveFeedFilter: "all" | "following" =
    feedFilter === "following" && followsEnabled ? "following" : "all"

  const filteredPosts = useMemo(() => {
    const byRecency = (items: FeedPost[]) => {
      return [...items].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    }

    const byRelevance = (items: FeedPost[]) => {
      const now = Date.now()
      return [...items].sort((a, b) => {
        const aVotes = postVotesByPost[a.id] ?? { confirmed: 0, denied: 0, userVote: null }
        const bVotes = postVotesByPost[b.id] ?? { confirmed: 0, denied: 0, userVote: null }
        const aComments = (postCommentsByPost[a.id] ?? []).length
        const bComments = (postCommentsByPost[b.id] ?? []).length
        const aAuthor = profilesById[a.author_user_id]
        const bAuthor = profilesById[b.author_user_id]

        const aHours = Math.max(1, (now - new Date(a.created_at).getTime()) / (1000 * 60 * 60))
        const bHours = Math.max(1, (now - new Date(b.created_at).getTime()) / (1000 * 60 * 60))

        const aScore =
          (aVotes.confirmed * 2 +
            aComments * 1.5 +
            aVotes.denied * 0.5 +
            (aAuthor?.is_consultant_verified ? 1.25 : 0) +
            (aAuthor?.is_founder ? 0.75 : 0)) /
          Math.sqrt(aHours)
        const bScore =
          (bVotes.confirmed * 2 +
            bComments * 1.5 +
            bVotes.denied * 0.5 +
            (bAuthor?.is_consultant_verified ? 1.25 : 0) +
            (bAuthor?.is_founder ? 0.75 : 0)) /
          Math.sqrt(bHours)

        if (bScore !== aScore) return bScore - aScore
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    const sortPosts = (items: FeedPost[]) => (sortMode === "recent" ? byRecency(items) : byRelevance(items))

    if (effectiveFeedFilter === "all") return sortPosts(posts)
    if (!session?.user?.id) return []
    if (!followingIds.length) return []
    const visibleAuthorIds = new Set(followingIds)
    return sortPosts(posts.filter((post) => visibleAuthorIds.has(post.author_user_id)))
  }, [
    effectiveFeedFilter,
    followingIds,
    postCommentsByPost,
    postVotesByPost,
    profilesById,
    posts,
    session?.user?.id,
    sortMode,
  ])

  const registerPostView = useCallback(async (postId: string) => {
    if (!session?.user?.id) return
    if (!postViewsEnabled) return
    if (viewedPostIdsRef.current.has(postId)) return

    viewedPostIdsRef.current.add(postId)
    setPostViewsByPost((prev) => ({
      ...prev,
      [postId]: (prev[postId] ?? 0) + 1,
    }))

    const request = await supabase
      .from("user_post_views")
      .insert({ post_id: postId, user_id: session.user.id })

    if (request.error) {
      // Já existe visualização desse usuário para esse post: não trata como falha.
      if ((request.error as { code?: string }).code === "23505") return
      viewedPostIdsRef.current.delete(postId)
      setPostViewsByPost((prev) => ({
        ...prev,
        [postId]: Math.max(0, (prev[postId] ?? 1) - 1),
      }))
    }
  }, [postViewsEnabled, session?.user?.id])

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

  const handleOpenReport = (
    contentType: ModerationContentType,
    contentId: string,
    label: string
  ) => {
    setReportTarget({ contentType, contentId, label })
    setReportReason("spam")
    setReportDetails("")
    setErrorMessage("")
  }

  const handleSubmitReport = async () => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para denunciar.")
      return
    }
    if (!reportTarget || submittingReport) return

    setSubmittingReport(true)
    setErrorMessage("")
    setInfoMessage("")

    const result = await supabase.rpc("moderation_submit_report", {
      p_content_type: reportTarget.contentType,
      p_content_id: reportTarget.contentId,
      p_reason: reportReason,
      p_details: reportDetails.trim() || null,
    })

    if (result.error) {
      setErrorMessage(`Falha ao enviar denúncia: ${result.error.message}`)
      setSubmittingReport(false)
      return
    }

    const row = Array.isArray(result.data) ? result.data[0] : null
    const grouped = Boolean(row?.grouped)
    const alreadyReported = Boolean(row?.already_reported)
    if (alreadyReported) {
      setInfoMessage("Você já denunciou este conteúdo pelo mesmo motivo.")
    } else {
      setInfoMessage(
        grouped
          ? "Denúncia anexada a um caso em andamento. Você será notificado sobre o andamento."
          : `Denúncia ${MODERATION_STATUS_LABEL.enviada.toLowerCase()}. Você será notificado sobre o andamento.`
      )
    }

    setReportTarget(null)
    setSubmittingReport(false)
  }

  const submitPostReply = async (postId: string, parentCommentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para responder.")
      return
    }
    if (!postCommentsEnabled) {
      setErrorMessage("Comentários em publicações ainda não foram habilitados no banco.")
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
    return filteredPosts
      .filter((post) => !hiddenPostIds.includes(post.id))
      .map((post) => {
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
  }, [filteredPosts, hiddenPostIds, profilesById, versionsById])

  const videoCards = useMemo(() => {
    return filteredPosts
      .filter((post) => post.media_kind === "video" && Boolean(toPostMediaSrc(post.media_path)))
      .map((post) => {
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
  }, [filteredPosts, profilesById, versionsById])

  const openVideoSequence = (postId: string) => {
    const index = videoCards.findIndex((item) => item.post.id === postId)
    if (index < 0) return
    setActiveVideoIndex(index)
    setVideoSequenceOpen(true)
  }

  const switchToVideo = (nextIndex: number) => {
    if (!videoCards.length) return
    if (videoSwitchTimerRef.current) {
      clearTimeout(videoSwitchTimerRef.current)
      videoSwitchTimerRef.current = null
    }

    setIsVideoSwitching(true)
    videoSwitchTimerRef.current = setTimeout(() => {
      setActiveVideoIndex(nextIndex)
      setSequenceProgress(0)
      requestAnimationFrame(() => setIsVideoSwitching(false))
    }, 120)
  }

  const goToNextVideo = () => {
    if (!videoCards.length) return
    const next = (activeVideoIndex + 1) % videoCards.length
    switchToVideo(next)
  }

  const goToPrevVideo = () => {
    if (!videoCards.length) return
    const next = (activeVideoIndex - 1 + videoCards.length) % videoCards.length
    switchToVideo(next)
  }

  useEffect(() => {
    if (!videoSequenceOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null
      const isTyping =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.isContentEditable
      if (isTyping) return

      if (event.key === "Escape") setVideoSequenceOpen(false)
      if (event.key.toLowerCase() === "m") {
        event.preventDefault()
        setIsSequenceMuted((prev) => !prev)
        return
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault()
        setIsSequencePlaying((prev) => !prev)
        return
      }

      if (event.ctrlKey && event.key === "ArrowUp") {
        event.preventDefault()
        setSequenceVolume((prev) => {
          const next = Math.min(1, Number((prev + 0.05).toFixed(2)))
          if (next > 0) setIsSequenceMuted(false)
          return next
        })
        return
      }

      if (event.ctrlKey && event.key === "ArrowDown") {
        event.preventDefault()
        setSequenceVolume((prev) => {
          const next = Math.max(0, Number((prev - 0.05).toFixed(2)))
          if (next <= 0) setIsSequenceMuted(true)
          return next
        })
        return
      }

      if (event.key === "ArrowDown") goToNextVideo()
      if (event.key === "ArrowUp") goToPrevVideo()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [videoSequenceOpen, videoCards.length, activeVideoIndex])

  useEffect(() => {
    const video = sequenceVideoRef.current
    if (!video) return
    video.muted = isSequenceMuted
    video.volume = sequenceVolume
  }, [activeVideoIndex, isSequenceMuted, sequenceVolume, videoSequenceOpen])

  useEffect(() => {
    const video = sequenceVideoRef.current
    if (!video) return
    if (isSequencePlaying) {
      const attempt = video.play()
      if (attempt && typeof attempt.catch === "function") {
        void attempt.catch(() => undefined)
      }
    } else {
      video.pause()
    }
  }, [activeVideoIndex, isSequencePlaying, videoSequenceOpen])

  useEffect(() => {
    return () => {
      if (videoSwitchTimerRef.current) {
        clearTimeout(videoSwitchTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const shouldAutoOpen = new URLSearchParams(window.location.search).get("pistoes") === "1"
    if (!shouldAutoOpen) return
    if (autoOpenedPistoes.current) return
    if (!videoCards.length) return

    autoOpenedPistoes.current = true
    setActiveVideoIndex(0)
    setVideoSequenceOpen(true)
  }, [videoCards.length])

  useEffect(() => {
    if (!videoSequenceOpen) return
    const active = videoCards[activeVideoIndex]
    if (!active) return
    void registerPostView(active.post.id)
  }, [videoSequenceOpen, activeVideoIndex, videoCards, registerPostView])

  useEffect(() => {
    if (!postCards.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target as HTMLElement
          const postId = target.dataset.postId
          if (!postId) continue

          const isQualifiedView = entry.isIntersecting && entry.intersectionRatio >= 0.6
          const existingTimer = pendingPostViewTimersRef.current.get(postId)

          if (isQualifiedView && !viewedPostIdsRef.current.has(postId) && !existingTimer) {
            const timer = setTimeout(() => {
              pendingPostViewTimersRef.current.delete(postId)
              void registerPostView(postId)
            }, 2000)
            pendingPostViewTimersRef.current.set(postId, timer)
            continue
          }

          if (!isQualifiedView && existingTimer) {
            clearTimeout(existingTimer)
            pendingPostViewTimersRef.current.delete(postId)
          }
        }
      },
      { threshold: [0, 0.6, 1] }
    )

    for (const card of postCards) {
      const element = postCardElementsRef.current[card.post.id]
      if (element) observer.observe(element)
    }

    return () => {
      observer.disconnect()
      for (const timer of pendingPostViewTimersRef.current.values()) {
        clearTimeout(timer)
      }
      pendingPostViewTimersRef.current.clear()
    }
  }, [postCards, registerPostView])

  return (
    <main className="min-h-screen max-w-6xl mx-auto px-6 md:px-8 pt-28 pb-16 space-y-8">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Feed</h1>
            <p className="mt-2 text-sm text-gray-600">
              Novos modelos, discussoes em alta e top da semana.
            </p>
            {session?.user?.id ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setFeedFilter("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    effectiveFeedFilter === "all"
                      ? "bg-black text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setFeedFilter("following")}
                  disabled={!followsEnabled}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
                    effectiveFeedFilter === "following"
                      ? "bg-black text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Seguindo
                </button>
              </div>
            ) : null}
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
      {infoMessage ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          {infoMessage}
        </section>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,2fr)]">
        <article id="pistoes" className="min-w-0 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="inline-flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Newspaper size={18} />
              Publicações da comunidade
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {hiddenPostIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setHiddenPostIds([])}
                  className="rounded-full border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Mostrar ocultas ({hiddenPostIds.length})
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setSortMode("recent")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  sortMode === "recent"
                    ? "bg-black text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Recentes
              </button>
              <button
                type="button"
                onClick={() => setSortMode("relevant")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  sortMode === "relevant"
                    ? "bg-black text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Relevantes
              </button>
            </div>
          </div>
          {!postsEnabled ? (
            <p className="mt-3 text-sm text-gray-600">
              Estrutura de postagens ainda nao disponivel no banco.
            </p>
          ) : null}

          {postsEnabled && !postCards.length ? (
            <p className="mt-3 text-sm text-gray-600">
              {effectiveFeedFilter === "following"
                ? "Nenhuma publicação de perfis que você segue."
                : "Nenhuma publicação ainda."}
            </p>
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
                const viewsCount = postViewsByPost[card.post.id] ?? 0
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
                const isVideoPost = card.post.media_kind === "video"
                return (
                  <article
                    key={card.post.id}
                    data-post-id={card.post.id}
                    ref={(element) => {
                      postCardElementsRef.current[card.post.id] = element
                    }}
                    className={`min-w-0 overflow-hidden rounded-xl border p-4 ${
                      isVideoPost
                        ? "border-blue-300 bg-gradient-to-b from-blue-50/60 to-white"
                        : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <UserIdentityBadge
                        name={card.authorName}
                        profileId={card.post.author_user_id}
                        avatarUrl={card.authorAvatar}
                        badgeText={toProfileBadgeText(profilesById[card.post.author_user_id])}
                        size="sm"
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">
                          {new Date(card.post.created_at).toLocaleString("pt-BR")}
                        </span>
                        {session?.user?.id && session.user.id !== card.post.author_user_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenReport("user_post", card.post.id, "Publicação da comunidade")
                            }
                            className="inline-flex items-center text-gray-600 hover:text-black"
                            title="Denunciar publicação"
                            aria-label="Denunciar publicação"
                          >
                            <Flag size={13} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setHiddenPostIds((prev) =>
                              prev.includes(card.post.id) ? prev : [...prev, card.post.id]
                            )
                          }
                          className="inline-flex items-center rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-black"
                          title="Ocultar publicação temporariamente"
                          aria-label="Ocultar publicação temporariamente"
                        >
                          Ocultar
                        </button>
                      </div>
                    </div>

                    <p className="mt-2 text-xs uppercase tracking-[0.08em] text-gray-500">
                      {card.post.type === "noticia" ? "Noticia" : "Publicacao"}
                      {card.authorUsername ? ` - @${card.authorUsername}` : ""}
                    </p>
                    {isVideoPost ? (
                      <span className="mt-1 inline-flex rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        Pistoes
                      </span>
                    ) : null}
                    {card.post.title ? (
                      <h3 className="mt-1 text-lg font-semibold text-gray-900">{card.post.title}</h3>
                    ) : null}

                    {mediaSrc && card.post.media_kind === "image" ? (
                      <div className="relative mt-3 h-72 w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                        <Image src={mediaSrc} alt="Midia da postagem" fill className="object-cover" />
                      </div>
                    ) : null}

                    {mediaSrc && card.post.media_kind === "video" ? (
                      <div className="mt-3">
                        <div className="h-[360px] w-full overflow-hidden rounded-lg border border-gray-200 bg-black">
                          <video
                            src={mediaSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            preload="metadata"
                            className="h-full w-full cursor-pointer object-cover"
                            onClick={() => openVideoSequence(card.post.id)}
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-blue-700">Toque no vídeo para abrir em sequência.</p>
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <p
                        className={`text-sm text-gray-800 whitespace-pre-wrap ${
                          expandedDescriptionByPost[card.post.id] ? "" : "line-clamp-2"
                        } break-words [overflow-wrap:anywhere]`}
                      >
                        {card.post.description}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          if (!expandedDescriptionByPost[card.post.id]) {
                            void registerPostView(card.post.id)
                          }
                          setExpandedDescriptionByPost((prev) => ({
                            ...prev,
                            [card.post.id]: !prev[card.post.id],
                          }))
                        }}
                        className="mt-1 text-xs font-medium text-gray-700 underline underline-offset-2 hover:text-black"
                      >
                        {expandedDescriptionByPost[card.post.id] ? "Ver menos" : "Ver mais"}
                      </button>
                    </div>

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
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 disabled:opacity-60 ${
                          voteStats.userVote === true
                            ? "bg-green-600 border-green-600 text-white shadow-md shadow-green-500/30"
                            : "border-green-300 text-green-700 hover:-translate-y-[1px] hover:scale-[1.02] hover:border-green-400 hover:bg-green-50 hover:shadow-md hover:shadow-green-300/40 active:translate-y-0 active:scale-[0.98]"
                        }`}
                      >
                        <Check size={14} />
                        {voteStats.confirmed}
                      </button>
                      <button
                        type="button"
                        onClick={() => void voteOnPost(card.post.id, false)}
                        disabled={!postVotesEnabled || submittingVotePostId === card.post.id}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border transition-all duration-200 disabled:opacity-60 ${
                          voteStats.userVote === false
                            ? "bg-red-600 border-red-600 text-white shadow-md shadow-red-500/30"
                            : "border-red-300 text-red-700 hover:-translate-y-[1px] hover:scale-[1.02] hover:border-red-400 hover:bg-red-50 hover:shadow-md hover:shadow-red-300/40 active:translate-y-0 active:scale-[0.98]"
                        }`}
                      >
                        <X size={14} />
                        {voteStats.denied}
                      </button>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 bg-gray-50">
                        <Eye size={14} />
                        {viewsCount}
                      </span>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 bg-gray-50">
                        <MessageCircle size={14} />
                        {postComments.length}
                      </span>
                    </div>

                    <div className="mt-3 border-t border-gray-200 pt-3 space-y-2">
                      {!postCommentsEnabled ? (
                        <p className="text-xs text-gray-500">
                          Comentários em publicações ainda não foram habilitados no banco.
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
                          placeholder="Comentar publicação..."
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
                          ? `Exibir comentários (${parentComments.length})`
                          : remainingComments > 0
                            ? `Exibir mais 8 comentários (${remainingComments} restantes)`
                            : "Ocultar comentários"}
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
                                badgeText={toProfileBadgeText(profile)}
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
                                {session?.user?.id !== comment.user_id ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenReport(
                                        "user_post_comment",
                                        comment.id,
                                        "Comentário em publicação"
                                      )
                                    }
                                    title="Denunciar comentário"
                                    aria-label="Denunciar comentário"
                                    className="inline-flex items-center text-gray-600 hover:text-black"
                                  >
                                    <Flag size={13} />
                                  </button>
                                ) : null}
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
                              <p className="mt-1 text-sm text-gray-800 break-words [overflow-wrap:anywhere]">
                                {comment.content}
                              </p>
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
                                  placeholder="Responder comentário..."
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
                                          badgeText={toProfileBadgeText(replyProfile)}
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
                                          {session?.user?.id !== reply.user_id ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleOpenReport(
                                                  "user_post_comment",
                                                  reply.id,
                                                  "Resposta em publicação"
                                                )
                                              }
                                              title="Denunciar resposta"
                                              aria-label="Denunciar resposta"
                                              className="inline-flex items-center text-gray-600 hover:text-black"
                                            >
                                              <Flag size={12} />
                                            </button>
                                          ) : null}
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
                                        <p className="mt-1 text-xs text-gray-800 break-words [overflow-wrap:anywhere]">
                                          {reply.content}
                                        </p>
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
                                            placeholder="Responder comentário..."
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

        <aside className="min-w-0 grid gap-4">
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
            <h3 className="text-lg font-semibold text-gray-900">Discussões em alta</h3>
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
                      {item.comments} comentários - {item.votes} votos
                    </p>
                  </Link>
                )
              })}
              {!hotDiscussions.length ? <p className="text-sm text-gray-600">Sem dados.</p> : null}
            </div>
          </article>

          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm min-h-[250px]">
            <h3 className="text-lg font-semibold text-gray-900">Novos modelos/versões</h3>
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

      {reportTarget ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Denunciar conteúdo</h3>
                <p className="mt-1 text-xs text-gray-600">{reportTarget.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Fechar denúncia"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-gray-600">
                  Motivo
                </label>
                <select
                  value={reportReason}
                  onChange={(event) => setReportReason(event.target.value as ModerationReason)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {MODERATION_REASON_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.08em] text-gray-600">
                  Detalhes (opcional)
                </label>
                <textarea
                  value={reportDetails}
                  onChange={(event) => setReportDetails(event.target.value)}
                  rows={4}
                  placeholder="Descreva o contexto da denúncia"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportTarget(null)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitReport()}
                disabled={submittingReport}
                className="rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-60"
              >
                {submittingReport ? "Enviando..." : "Enviar denúncia"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {videoSequenceOpen && videoCards.length > 0 ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 px-4"
          onWheel={(event) => {
            if (event.deltaY > 0) goToNextVideo()
            else if (event.deltaY < 0) goToPrevVideo()
          }}
        >
          <div className="w-full max-w-6xl rounded-2xl border border-gray-700 bg-black p-3 shadow-2xl">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-300">
                  Pistões
                </p>
                <span className="inline-flex items-center gap-1 rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-300">
                  <Eye size={12} />
                  {postViewsByPost[videoCards[activeVideoIndex].post.id] ?? 0}
                </span>
                <button
                  type="button"
                  onClick={() => void voteOnPost(videoCards[activeVideoIndex].post.id, true)}
                  disabled={!postVotesEnabled || submittingVotePostId === videoCards[activeVideoIndex].post.id}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                    (postVotesByPost[videoCards[activeVideoIndex].post.id]?.userVote ?? null) === true
                      ? "border-green-500 bg-green-600 text-white shadow-md shadow-green-500/30"
                      : "border-green-400 text-green-300 transition-all duration-200 hover:-translate-y-[1px] hover:scale-[1.03] hover:bg-green-900/40 hover:shadow-md hover:shadow-green-500/25 active:translate-y-0 active:scale-[0.98]"
                  }`}
                >
                  <Check size={12} />
                  {postVotesByPost[videoCards[activeVideoIndex].post.id]?.confirmed ?? 0}
                </button>
                <button
                  type="button"
                  onClick={() => void voteOnPost(videoCards[activeVideoIndex].post.id, false)}
                  disabled={!postVotesEnabled || submittingVotePostId === videoCards[activeVideoIndex].post.id}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                    (postVotesByPost[videoCards[activeVideoIndex].post.id]?.userVote ?? null) === false
                      ? "border-red-500 bg-red-600 text-white shadow-md shadow-red-500/30"
                      : "border-red-400 text-red-300 transition-all duration-200 hover:-translate-y-[1px] hover:scale-[1.03] hover:bg-red-900/40 hover:shadow-md hover:shadow-red-500/25 active:translate-y-0 active:scale-[0.98]"
                  }`}
                >
                  <X size={12} />
                  {postVotesByPost[videoCards[activeVideoIndex].post.id]?.denied ?? 0}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => setIsSequenceMuted((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-gray-400 hover:bg-gray-800 active:translate-y-0 active:scale-[0.98]"
                  >
                    {isSequenceMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    {isSequenceMuted ? "Sem áudio" : "Com áudio"}
                  </button>
                  <div className="pointer-events-none absolute right-0 top-full z-20 mt-1 w-36 rounded-md border border-gray-700 bg-black/95 p-2 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-gray-400">
                      Volume ({Math.round(sequenceVolume * 100)}%)
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(sequenceVolume * 100)}
                      onChange={(event) => {
                        const next = Number(event.target.value) / 100
                        setSequenceVolume(next)
                        setIsSequenceMuted(next <= 0)
                      }}
                      className="h-1.5 w-full accent-gray-200"
                    />
                    <p className="mt-1 text-[10px] text-gray-500">M mute • Ctrl+setas volume</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSequencePlaying((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-gray-400 hover:bg-gray-800 active:translate-y-0 active:scale-[0.98]"
                >
                  {isSequencePlaying ? <Pause size={13} /> : <Play size={13} />}
                  {isSequencePlaying ? "Pausar" : "Reproduzir"} (K)
                </button>
                <button
                  type="button"
                  onClick={goToPrevVideo}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-gray-400 hover:bg-gray-800 active:translate-y-0 active:scale-[0.98]"
                >
                  <ChevronUp size={13} />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={goToNextVideo}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-600 px-2 py-1 text-xs text-gray-200 transition-all duration-200 hover:-translate-y-[1px] hover:border-gray-400 hover:bg-gray-800 active:translate-y-0 active:scale-[0.98]"
                >
                  <ChevronDown size={13} />
                  Próximo
                </button>
                <button
                  type="button"
                  onClick={() => setVideoSequenceOpen(false)}
                  className="rounded-md p-1 text-gray-300 transition-all duration-200 hover:-translate-y-[1px] hover:bg-gray-800 hover:text-white active:translate-y-0 active:scale-[0.96]"
                  aria-label="Fechar sequência"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_56px_320px]">
              <div className="flex h-[78vh] flex-col">
                <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg bg-black">
                  <video
                    ref={sequenceVideoRef}
                    key={videoCards[activeVideoIndex].post.id}
                    src={toPostMediaSrc(videoCards[activeVideoIndex].post.media_path) ?? undefined}
                    autoPlay
                    loop
                    muted={isSequenceMuted}
                    onTimeUpdate={(event) => {
                      const video = event.currentTarget
                      const progress = video.duration > 0 ? (video.currentTime / video.duration) * 100 : 0
                      setSequenceProgress(progress)
                    }}
                  onLoadedMetadata={() => setSequenceProgress(0)}
                  playsInline
                  className={`h-full w-full rounded-lg bg-black object-contain transition-all duration-200 ${
                    isVideoSwitching ? "opacity-0 scale-[0.985]" : "opacity-100 scale-100"
                  }`}
                />
              </div>
                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-700/60">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={sequenceProgress}
                    onChange={(event) => {
                      const next = Number(event.target.value)
                      setSequenceProgress(next)
                      const video = sequenceVideoRef.current
                      if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return
                      video.currentTime = (next / 100) * video.duration
                    }}
                    className="h-full w-full cursor-pointer accent-gray-100"
                    aria-label="Barra de reprodução do vídeo"
                  />
                </div>
              </div>

              <div className="hidden lg:flex h-[78vh] flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={goToPrevVideo}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-gray-600 text-gray-200 transition-all duration-200 hover:scale-105 hover:border-gray-400 hover:bg-gray-800 active:scale-95"
                  aria-label="Vídeo anterior"
                >
                  <ChevronUp size={18} />
                </button>
                <button
                  type="button"
                  onClick={goToNextVideo}
                  className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-gray-600 text-gray-200 transition-all duration-200 hover:scale-105 hover:border-gray-400 hover:bg-gray-800 active:scale-95"
                  aria-label="Próximo vídeo"
                >
                  <ChevronDown size={18} />
                </button>
              </div>

              <aside className="flex h-[78vh] min-h-0 flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-950/70">
                <div className="border-b border-gray-700 px-3 py-2">
                  <div className="mb-1 flex items-center gap-2">
                    <UserIdentityBadge
                      name={videoCards[activeVideoIndex].authorName}
                      profileId={videoCards[activeVideoIndex].post.author_user_id}
                      avatarUrl={videoCards[activeVideoIndex].authorAvatar}
                      badgeText={toProfileBadgeText(profilesById[videoCards[activeVideoIndex].post.author_user_id])}
                      size="xs"
                    />
                    {videoCards[activeVideoIndex].authorUsername ? (
                      <span className="text-[11px] text-gray-400">
                        @{videoCards[activeVideoIndex].authorUsername}
                      </span>
                    ) : null}
                  </div>
                  <p className="mb-1 text-xs text-gray-200 break-words [overflow-wrap:anywhere]">
                    {videoCards[activeVideoIndex].post.description || "Sem legenda."}
                  </p>
                  <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-300">
                    Comentários do vídeo
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {(() => {
                    const activePostId = videoCards[activeVideoIndex].post.id
                    const allComments = postCommentsByPost[activePostId] ?? []
                    const comments = allComments.filter((item) => !item.parent_comment_id)
                    const repliesByParent = allComments.reduce<Record<string, PostCommentRow[]>>((acc, item) => {
                      if (!item.parent_comment_id) return acc
                      acc[item.parent_comment_id] = [...(acc[item.parent_comment_id] ?? []), item]
                      return acc
                    }, {})
                    const activeReplyCommentId = activeReplyCommentIdByPost[activePostId] ?? null

                    if (!comments.length) {
                      return <p className="text-xs text-gray-400">Sem comentários por enquanto.</p>
                    }

                    return (
                      <div className="space-y-2">
                        {comments.map((comment) => {
                          const profile = profilesById[comment.user_id]
                          const replies = repliesByParent[comment.id] ?? []
                          return (
                            <div key={comment.id} className="rounded-md border border-gray-700 bg-black/40 p-2">
                              <div className="flex items-center justify-between gap-2">
                                <UserIdentityBadge
                                  name={profile?.name ?? "Usuário"}
                                  profileId={comment.user_id}
                                  avatarUrl={profile?.avatar_url ?? null}
                                  badgeText={toProfileBadgeText(profile)}
                                  size="xs"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setActiveReplyCommentIdByPost((prev) => ({
                                      ...prev,
                                      [activePostId]:
                                        activeReplyCommentId === comment.id ? null : comment.id,
                                    }))
                                  }
                                  className="text-[11px] text-gray-300 underline underline-offset-2 hover:text-white"
                                >
                                  Responder
                                </button>
                              </div>
                              <p className="mt-1 text-[11px] text-gray-400">
                                {new Date(comment.created_at).toLocaleDateString("pt-BR")}
                              </p>
                              <p className="mt-1 text-xs text-gray-100 break-words [overflow-wrap:anywhere]">
                                {comment.content}
                              </p>

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
                                    placeholder="Responder comentário..."
                                    className="flex-1 rounded-md border border-gray-600 bg-black/50 px-3 py-2 text-xs text-gray-100"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void submitPostReply(activePostId, comment.id)}
                                    disabled={
                                      !postCommentsEnabled ||
                                      submittingCommentPostId === activePostId
                                    }
                                    className="rounded-md bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-200 disabled:opacity-60"
                                  >
                                    Enviar
                                  </button>
                                </div>
                              ) : null}

                              {replies.length > 0 ? (
                                <div className="mt-2 space-y-1 border-l border-gray-700 pl-2">
                                  {replies.map((reply) => {
                                    const replyProfile = profilesById[reply.user_id]
                                    return (
                                      <div key={reply.id} className="rounded-md bg-black/30 p-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <UserIdentityBadge
                                            name={replyProfile?.name ?? "Usuário"}
                                            profileId={reply.user_id}
                                            avatarUrl={replyProfile?.avatar_url ?? null}
                                            badgeText={toProfileBadgeText(replyProfile)}
                                            size="xs"
                                          />
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setActiveReplyCommentIdByPost((prev) => ({
                                                ...prev,
                                                [activePostId]:
                                                  activeReplyCommentId === reply.id ? null : reply.id,
                                              }))
                                            }
                                            className="text-[11px] text-gray-300 underline underline-offset-2 hover:text-white"
                                          >
                                            Responder
                                          </button>
                                        </div>
                                        <p className="mt-1 text-[11px] text-gray-400">
                                          {new Date(reply.created_at).toLocaleDateString("pt-BR")}
                                        </p>
                                        <p className="mt-1 text-xs text-gray-100 break-words [overflow-wrap:anywhere]">
                                          {reply.content}
                                        </p>
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
                                              placeholder="Responder comentário..."
                                              className="flex-1 rounded-md border border-gray-600 bg-black/50 px-3 py-2 text-xs text-gray-100"
                                            />
                                            <button
                                              type="button"
                                              onClick={() => void submitPostReply(activePostId, reply.id)}
                                              disabled={
                                                !postCommentsEnabled ||
                                                submittingCommentPostId === activePostId
                                              }
                                              className="rounded-md bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-200 disabled:opacity-60"
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
                    )
                  })()}
                </div>
                <div className="border-t border-gray-700 p-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={commentDraftByPost[videoCards[activeVideoIndex].post.id] ?? ""}
                      onChange={(event) =>
                        setCommentDraftByPost((prev) => ({
                          ...prev,
                          [videoCards[activeVideoIndex].post.id]: event.target.value,
                        }))
                      }
                      placeholder="Comentar este vídeo..."
                      className="flex-1 rounded-md border border-gray-600 bg-black/50 px-3 py-2 text-xs text-gray-100"
                    />
                    <button
                      type="button"
                      onClick={() => void submitPostComment(videoCards[activeVideoIndex].post.id)}
                      disabled={
                        !postCommentsEnabled ||
                        submittingCommentPostId === videoCards[activeVideoIndex].post.id
                      }
                      className="rounded-md bg-white px-3 py-2 text-xs font-medium text-black hover:bg-gray-200 disabled:opacity-60"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}

const toProfileBadgeText = (profile: ProfileRow | undefined) => {
  if (!profile) return null
  if (profile.is_founder) return "Fundador"
  if (profile.is_consultant_verified) return "Consultor verificado"
  return null
}



