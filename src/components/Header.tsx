"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { Bell, Menu, Newspaper, SquarePen, X } from "lucide-react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import UserIdentityBadge from "@/components/UserIdentityBadge"

const SECTION_SHORTCUTS: Record<string, { id: string; label: string }[]> = {
  "/": [
    { id: "posicionamento", label: "Posicionamento" },
    { id: "base-destaque", label: "Base em destaque" },
    { id: "proximo-passo", label: "Decisão" },
  ],
}


type CommentNotifRow = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  vehicle_version_id: string
  parent_comment_id?: string | null
  reply_to_user_id?: string | null
}

type NotificationItem = {
  id: string
  label: string
  preview: string
  href: string
  createdAt: string
  actorName: string
  actorAvatarUrl: string | null
  actorId: string | null
  vehicleImageUrl: string | null
  runtimeKind?: "vote"
}

type ProfileMini = {
  id: string
  name: string | null
  avatar_url?: string | null
}

type VersionMini = {
  id: string
  slug: string
  image_url?: string | null
}

type OwnedCommentMini = {
  id: string
  vehicle_version_id: string
}

type OwnedPointMini = {
  id: string
  vehicle_version_id: string
}

type CommentVoteMini = {
  comment_id: string
  user_id: string
  is_confirmed: boolean
  created_at?: string | null
  updated_at?: string | null
}

type PositiveVoteMini = {
  positive_id: string
  user_id: string
  is_confirmed: boolean
  created_at?: string | null
  updated_at?: string | null
}

type DefectVoteMini = {
  defect_id: string
  user_id: string
  is_confirmed: boolean
  created_at?: string | null
  updated_at?: string | null
}

type DbNotificationRow = {
  id: string
  label: string
  preview: string
  href: string
  created_at: string
  updated_at?: string | null
  actor_user_id: string | null
  actor_name: string | null
  actor_avatar_url: string | null
  vehicle_image_url: string | null
  is_read: boolean
}

const NOTIFICATION_LIMIT = 20
const TOAST_DURATION_MS = 7000
const RUNTIME_NOTIFICATION_PREFIX = "rt-"
const VOTE_EDIT_WINDOW_MS = 3 * 60 * 1000
const VOTE_NOTIFICATION_DELAY_MS = 0
const COMMENT_VOTE_NOTIFICATION_DELAY_MS = 0
const VEHICLE_STORAGE_URL =
  "https://njitzfpyhwcqoaluuvqo.supabase.co/storage/v1/object/public/vehicle-images/"

const stripQuotePrefix = (text: string) => {
  if (!text.startsWith("[[QUOTE|")) return text
  const end = text.indexOf("]]")
  if (end === -1) return text
  return text.slice(end + 2).trimStart()
}

const toPreview = (text: string, size = 90) => {
  const compact = stripQuotePrefix(text).replace(/\s+/g, " ").trim()
  if (!compact) return "Sem texto"
  return compact.length > size ? `${compact.slice(0, size)}...` : compact
}

const toVehicleImageSrc = (value: string | null | undefined) => {
  if (!value) return null
  const raw = value.trim()
  if (!raw) return null

  const lowered = raw.toLowerCase()
  if (lowered === "null" || lowered === "undefined" || raw === "[object Object]") return null
  if (lowered.startsWith("blob:")) return null

  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      const url = new URL(raw)
      return url.toString()
    } catch {
      return null
    }
  }

  if (raw.startsWith("/")) return raw

  const encodedPath = raw
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/")

  const finalUrl = `${VEHICLE_STORAGE_URL}${encodedPath}`
  try {
    const url = new URL(finalUrl)
    return url.toString()
  } catch {
    return null
  }
}

const toTimestamp = (value: string | null | undefined) => {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

const notificationsCacheKey = (userId: string) => `notifications:cache:${userId}`
const notificationsReadKey = (userId: string) => `notifications:read:${userId}`

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [profileName, setProfileName] = useState<string | null>(null)
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [profilePlan, setProfilePlan] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])
  const [recentlyReadOnOpen, setRecentlyReadOnOpen] = useState<string[]>([])
  const [liveToast, setLiveToast] = useState<NotificationItem | null>(null)
  const headerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const hasFetchedNotifications = useRef(false)
  const knownNotificationIds = useRef<Set<string>>(new Set())
  const pendingVoteTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const notificationCreatedAtById = useRef<Map<string, string>>(new Map())

  const { session, signOut } = useAuth()
  const user = session?.user
  const pathname = usePathname()
  const isCarSlugPage = useMemo(() => /^\/carros\/[^/]+$/.test(pathname), [pathname])
  const shortcuts = useMemo(() => {
    if (isCarSlugPage) return []
    return SECTION_SHORTCUTS[pathname] ?? []
  }, [isCarSlugPage, pathname])
  const readNotificationSet = useMemo(
    () => new Set(readNotificationIds),
    [readNotificationIds]
  )
  const recentlyReadSet = useMemo(() => new Set(recentlyReadOnOpen), [recentlyReadOnOpen])
  const unreadCount = useMemo(
    () => notifications.filter((item) => !readNotificationSet.has(item.id)).length,
    [notifications, readNotificationSet]
  )
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour >= 18) return "Boa noite"
    if (hour >= 12) return "Boa tarde"
    return "Bom dia"
  }, [])

  // Scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 40)
      if (notificationsOpen) {
        setNotificationsOpen(false)
        setRecentlyReadOnOpen([])
      }
      if (menuOpen) setMenuOpen(false)
    }

    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [menuOpen, notificationsOpen])

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null
      if (menuOpen && menuRef.current && target && !menuRef.current.contains(target)) {
        setMenuOpen(false)
      }
      if (
        notificationsOpen &&
        notificationsRef.current &&
        target &&
        !notificationsRef.current.contains(target)
      ) {
        setNotificationsOpen(false)
        setRecentlyReadOnOpen([])
      }
    }

    window.addEventListener("mousedown", handlePointerDown)
    return () => window.removeEventListener("mousedown", handlePointerDown)
  }, [menuOpen, notificationsOpen])

  useEffect(() => {
    if (!shortcuts.length) {
      setActiveSection(null)
      return
    }

    const resolveActiveByScroll = (elements: HTMLElement[]) => {
      if (!elements.length) return
      const headerOffset = 92
      let candidate: HTMLElement | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (const element of elements) {
        const distance = Math.abs(element.getBoundingClientRect().top - headerOffset)
        if (distance < bestDistance) {
          bestDistance = distance
          candidate = element
        }
      }

      if (candidate?.id) setActiveSection(candidate.id)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)

        if (visible[0]) {
          setActiveSection(visible[0].target.id)
        }
      },
      {
        root: null,
        threshold: [0.25, 0.5, 0.75],
        rootMargin: "-40% 0px -45% 0px",
      }
    )

    const elements = shortcuts
      .map((shortcut) => document.getElementById(shortcut.id))
      .filter((element): element is HTMLElement => Boolean(element))

    elements.forEach((element) => observer.observe(element))

    const handleViewportChange = () => {
      resolveActiveByScroll(elements)
    }
    window.addEventListener("scroll", handleViewportChange, { passive: true })
    window.addEventListener("resize", handleViewportChange)
    const frame = window.requestAnimationFrame(() => resolveActiveByScroll(elements))

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("scroll", handleViewportChange)
      window.removeEventListener("resize", handleViewportChange)
      elements.forEach((element) => observer.unobserve(element))
      observer.disconnect()
    }
  }, [shortcuts])

  // Buscar nome do perfil
  useEffect(() => {
      const fetchProfile = async () => {
      if (!user) {
        setProfileName(null)
        setProfileAvatar(null)
        setProfileUsername(null)
        setProfilePlan(null)
        return
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("name,avatar_url,username,plan")
        .eq("id", user.id)
        .single()

      if (error && /column|schema cache/i.test(error.message ?? "")) {
        const fallback = await supabase
          .from("profiles")
          .select("name,username,plan")
          .eq("id", user.id)
          .single()

        if (!fallback.error && fallback.data) {
          setProfileName(fallback.data.name)
          setProfileAvatar(null)
          setProfileUsername(fallback.data.username ?? null)
          setProfilePlan((fallback.data.plan as string | null) ?? null)
        }
        return
      }

      if (!error && data) {
        setProfileName(data.name)
        setProfileAvatar(data.avatar_url ?? null)
        setProfileUsername(data.username ?? null)
        setProfilePlan((data.plan as string | null) ?? null)
      }
    }

    fetchProfile()
  }, [user])

  useEffect(() => {
    if (!user?.id) return

    const raw = window.localStorage.getItem(notificationsCacheKey(user.id))
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as NotificationItem[]
      if (!Array.isArray(parsed)) return
      const sanitized = parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.label === "string" &&
            typeof item.preview === "string" &&
            typeof item.href === "string" &&
            typeof item.createdAt === "string" &&
            typeof item.actorName === "string"
        )
        .map((item) => ({
          ...item,
          vehicleImageUrl: toVehicleImageSrc(item.vehicleImageUrl),
        }))
        .slice(0, NOTIFICATION_LIMIT)
      const timer = window.setTimeout(() => {
        setNotifications(sanitized)
      }, 0)
      knownNotificationIds.current = new Set(sanitized.map((item) => item.id))
      for (const item of sanitized) {
        notificationCreatedAtById.current.set(item.id, item.createdAt)
      }
      return () => window.clearTimeout(timer)
    } catch {
      // Cache inválido: ignora e segue com fetch normal.
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    window.localStorage.setItem(
      notificationsCacheKey(user.id),
      JSON.stringify(notifications.slice(0, NOTIFICATION_LIMIT))
    )
  }, [notifications, user?.id])

  useEffect(() => {
    if (!user?.id) return

    const raw = window.localStorage.getItem(notificationsReadKey(user.id))
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as string[]
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.filter((item): item is string => typeof item === "string")
      const timer = window.setTimeout(() => {
        setReadNotificationIds(sanitized)
      }, 0)
      return () => window.clearTimeout(timer)
    } catch {
      // Cache inválido: ignora e segue.
    }
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    window.localStorage.setItem(
      notificationsReadKey(user.id),
      JSON.stringify(readNotificationIds)
    )
  }, [readNotificationIds, user?.id])

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      setNotifications([])
      setReadNotificationIds([])
      setRecentlyReadOnOpen([])
      return
    }
    const mentionNeedle = profileUsername?.trim().toLowerCase() || null

    const ownedVersionsRes = await supabase
      .from("vehicle_versions")
      .select("id,slug")
      .eq("created_by", user.id)

    const ownedVersions =
      ownedVersionsRes.error && /column|schema cache/i.test(ownedVersionsRes.error.message ?? "")
        ? []
        : ((ownedVersionsRes.data as { id: string; slug: string }[] | null) ?? [])
    const ownedVersionIds = new Set(ownedVersions.map((row) => row.id))

    const userCommentsByVersionRes = await supabase
      .from("vehicle_comments")
      .select("vehicle_version_id")
      .eq("created_by", user.id)
      .limit(400)
    const participatedVersionIds = new Set(
      ((userCommentsByVersionRes.data as { vehicle_version_id: string }[] | null) ?? []).map(
        (row) => row.vehicle_version_id
      )
    )

    const fullCommentsRes = await supabase
      .from("vehicle_comments")
      .select("id,content,created_by,created_at,vehicle_version_id,parent_comment_id,reply_to_user_id")
      .order("created_at", { ascending: false })
      .limit(140)

    let comments: CommentNotifRow[] = []
    if (fullCommentsRes.error && /column|schema cache/i.test(fullCommentsRes.error.message ?? "")) {
      const fallbackCommentsRes = await supabase
        .from("vehicle_comments")
        .select("id,content,created_by,created_at,vehicle_version_id,parent_comment_id")
        .order("created_at", { ascending: false })
        .limit(140)
      comments = ((fallbackCommentsRes.data as CommentNotifRow[] | null) ?? []).map((item) => ({
        ...item,
        reply_to_user_id: null,
      }))
    } else {
      comments = (fullCommentsRes.data as CommentNotifRow[] | null) ?? []
    }

    const commentsById = new Map(comments.map((comment) => [comment.id, comment]))
    const versionIds = Array.from(new Set(comments.map((comment) => comment.vehicle_version_id)))
    const versionSlugsRes =
      versionIds.length > 0
        ? await supabase
            .from("vehicle_versions")
            .select("id,slug,image_url")
            .in("id", versionIds)
        : { data: [] as VersionMini[] }
    const versionRows = (versionSlugsRes.data as VersionMini[] | null) ?? []
    const versionSlugMap = new Map(versionRows.map((row) => [row.id, row.slug]))
    const versionImageMap = new Map(
      versionRows.map((row) => [row.id, toVehicleImageSrc(row.image_url ?? null)])
    )

    const actorIds = Array.from(
      new Set(comments.map((comment) => comment.created_by).filter((id): id is string => Boolean(id && id !== user.id)))
    )
    const actorsRes =
      actorIds.length > 0
        ? await supabase.from("profiles").select("id,name,avatar_url").in("id", actorIds)
        : { data: [] as { id: string; name: string | null; avatar_url?: string | null }[] }
    const actorNameMap = new Map(
      ((actorsRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? []).map((row) => [row.id, row.name ?? "Usuario"])
    )
    const actorAvatarMap = new Map(
      ((actorsRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? []).map((row) => [row.id, row.avatar_url ?? null])
    )

    const items: NotificationItem[] = []

    for (const comment of comments) {
      if (!comment.created_by || comment.created_by === user.id) continue

      const actorName = actorNameMap.get(comment.created_by) ?? "Usuario"
      const normalizedContent = comment.content.toLowerCase()
      const isMention =
        Boolean(mentionNeedle) &&
        new RegExp(`(^|\\s)@${mentionNeedle}(\\b|\\s|$)`, "i").test(normalizedContent)
      const isReplyByField = comment.reply_to_user_id === user.id
      const parent = comment.parent_comment_id ? commentsById.get(comment.parent_comment_id) : null
      const isReplyByParentAuthor = parent?.created_by === user.id
      const isReply = isReplyByField || isReplyByParentAuthor
      const isOnOwnedContent = ownedVersionIds.has(comment.vehicle_version_id)
      const isInParticipatedThread = participatedVersionIds.has(comment.vehicle_version_id)

      if (!isMention && !isReply && !isOnOwnedContent && !isInParticipatedThread) continue

      const versionSlug = versionSlugMap.get(comment.vehicle_version_id)
      if (!versionSlug) continue

      const label = isReply
        ? `${actorName} respondeu seu comentário`
        : isMention
          ? `${actorName} mencionou voce`
          : isOnOwnedContent
            ? `${actorName} comentou em um conteudo seu`
            : `${actorName} comentou em uma discussao sua`

      items.push({
        id: comment.id,
        label,
        preview: toPreview(comment.content),
        href: `/carros/${versionSlug}#comment-${comment.id}`,
        createdAt: comment.created_at,
        actorName,
        actorAvatarUrl: actorAvatarMap.get(comment.created_by) ?? null,
        actorId: comment.created_by,
        vehicleImageUrl: versionImageMap.get(comment.vehicle_version_id) ?? null,
      })
    }

    // Fallback por polling para votos em comentários do próprio usuário.
    // Mantém notificação funcionando mesmo quando realtime de votes estiver instável.
    const ownedCommentsRes = await supabase
      .from("vehicle_comments")
      .select("id,vehicle_version_id")
      .eq("created_by", user.id)
      .limit(1500)

    const ownedComments = (ownedCommentsRes.data as OwnedCommentMini[] | null) ?? []
    const ownedCommentMap = new Map(ownedComments.map((row) => [row.id, row.vehicle_version_id]))
    const ownedCommentIds = ownedComments.map((row) => row.id)

    if (ownedCommentIds.length > 0) {
      let voteRows: CommentVoteMini[] = []
      const fullVotesRes = await supabase
        .from("vehicle_comment_votes")
        .select("comment_id,user_id,is_confirmed,created_at,updated_at")
        .in("comment_id", ownedCommentIds)
        .neq("user_id", user.id)

      if (!fullVotesRes.error) {
        voteRows = (fullVotesRes.data as CommentVoteMini[] | null) ?? []
      } else {
        const fallbackVotesRes = await supabase
          .from("vehicle_comment_votes")
          .select("comment_id,user_id,is_confirmed,created_at")
          .in("comment_id", ownedCommentIds)
          .neq("user_id", user.id)

        if (!fallbackVotesRes.error) {
          voteRows = (fallbackVotesRes.data as CommentVoteMini[] | null) ?? []
        } else {
          const legacyVotesRes = await supabase
            .from("vehicle_comment_votes")
            .select("comment_id,user_id,is_confirmed")
            .in("comment_id", ownedCommentIds)
            .neq("user_id", user.id)
          voteRows =
            ((legacyVotesRes.data as
              | { comment_id: string; user_id: string; is_confirmed: boolean }[]
              | null) ?? []
            ).map((row) => ({
              ...row,
              created_at: null,
              updated_at: null,
            }))
        }
      }

      const visibleVotes = voteRows

      const missingActorIds = Array.from(
        new Set(
          visibleVotes
            .map((vote) => vote.user_id)
            .filter((id) => !actorNameMap.has(id))
        )
      )
      if (missingActorIds.length > 0) {
        const extraActorsRes = await supabase
          .from("profiles")
          .select("id,name,avatar_url")
          .in("id", missingActorIds)
        for (const row of
          ((extraActorsRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? [])) {
          actorNameMap.set(row.id, row.name ?? "Usuario")
          actorAvatarMap.set(row.id, row.avatar_url ?? null)
        }
      }

      const missingVersionIds = Array.from(
        new Set(
          visibleVotes
            .map((vote) => ownedCommentMap.get(vote.comment_id))
            .filter((id): id is string => Boolean(id && !versionSlugMap.has(id)))
        )
      )
      if (missingVersionIds.length > 0) {
        const extraVersionsRes = await supabase
          .from("vehicle_versions")
          .select("id,slug,image_url")
          .in("id", missingVersionIds)
        for (const row of ((extraVersionsRes.data as VersionMini[] | null) ?? [])) {
          versionSlugMap.set(row.id, row.slug)
          versionImageMap.set(row.id, toVehicleImageSrc(row.image_url ?? null))
        }
      }

      for (const vote of visibleVotes) {
        const versionId = ownedCommentMap.get(vote.comment_id)
        if (!versionId) continue
        const versionSlug = versionSlugMap.get(versionId)
        if (!versionSlug) continue
        const actorName = actorNameMap.get(vote.user_id) ?? "Usuario"
        const notificationId = `${RUNTIME_NOTIFICATION_PREFIX}comment-vote-${vote.comment_id}-${vote.user_id}`
        const createdAt =
          vote.updated_at ??
          vote.created_at ??
          notificationCreatedAtById.current.get(notificationId) ??
          new Date().toISOString()
        items.push({
          id: notificationId,
          label: `${actorName} ${vote.is_confirmed ? "confirmou" : "negou"} seu comentário`,
          preview: vote.is_confirmed ? "Confirmação registrada." : "Negação registrada.",
          href: `/carros/${versionSlug}#comment-${vote.comment_id}`,
          createdAt,
          actorName,
          actorAvatarUrl: actorAvatarMap.get(vote.user_id) ?? null,
          actorId: vote.user_id,
          vehicleImageUrl: versionImageMap.get(versionId) ?? null,
          runtimeKind: "vote",
        })
      }
    }

    // Fallback por polling para votos em pontos positivos do próprio usuário.
    const ownedPositivesRes = await supabase
      .from("positives")
      .select("id,vehicle_version_id")
      .eq("created_by", user.id)
      .limit(1500)

    const ownedPositives = (ownedPositivesRes.data as OwnedPointMini[] | null) ?? []
    const ownedPositiveMap = new Map(ownedPositives.map((row) => [row.id, row.vehicle_version_id]))
    const ownedPositiveIds = ownedPositives.map((row) => row.id)

    if (ownedPositiveIds.length > 0) {
      let voteRows: PositiveVoteMini[] = []
      const fullVotesRes = await supabase
        .from("positive_votes")
        .select("positive_id,user_id,is_confirmed,created_at,updated_at")
        .in("positive_id", ownedPositiveIds)
        .neq("user_id", user.id)

      if (fullVotesRes.error && /column|schema cache/i.test(fullVotesRes.error.message ?? "")) {
        const fallbackVotesRes = await supabase
          .from("positive_votes")
          .select("positive_id,user_id,is_confirmed,created_at")
          .in("positive_id", ownedPositiveIds)
          .neq("user_id", user.id)
        voteRows = (fallbackVotesRes.data as PositiveVoteMini[] | null) ?? []
      } else if (fullVotesRes.error) {
        const legacyVotesRes = await supabase
          .from("positive_votes")
          .select("positive_id,user_id,is_confirmed")
          .in("positive_id", ownedPositiveIds)
          .neq("user_id", user.id)
        voteRows =
          ((legacyVotesRes.data as
            | { positive_id: string; user_id: string; is_confirmed: boolean }[]
            | null) ?? []
          ).map((row) => ({
            ...row,
            created_at: null,
            updated_at: null,
          }))
      } else {
        voteRows = (fullVotesRes.data as PositiveVoteMini[] | null) ?? []
      }

      const visibleVotes = voteRows

      const missingActorIds = Array.from(
        new Set(visibleVotes.map((vote) => vote.user_id).filter((id) => !actorNameMap.has(id)))
      )
      if (missingActorIds.length > 0) {
        const extraActorsRes = await supabase
          .from("profiles")
          .select("id,name,avatar_url")
          .in("id", missingActorIds)
        for (const row of
          ((extraActorsRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? [])) {
          actorNameMap.set(row.id, row.name ?? "Usuario")
          actorAvatarMap.set(row.id, row.avatar_url ?? null)
        }
      }

      const missingVersionIds = Array.from(
        new Set(
          visibleVotes
            .map((vote) => ownedPositiveMap.get(vote.positive_id))
            .filter((id): id is string => Boolean(id && !versionSlugMap.has(id)))
        )
      )
      if (missingVersionIds.length > 0) {
        const extraVersionsRes = await supabase
          .from("vehicle_versions")
          .select("id,slug,image_url")
          .in("id", missingVersionIds)
        for (const row of ((extraVersionsRes.data as VersionMini[] | null) ?? [])) {
          versionSlugMap.set(row.id, row.slug)
          versionImageMap.set(row.id, toVehicleImageSrc(row.image_url ?? null))
        }
      }

      for (const vote of visibleVotes) {
        const versionId = ownedPositiveMap.get(vote.positive_id)
        if (!versionId) continue
        const versionSlug = versionSlugMap.get(versionId)
        if (!versionSlug) continue
        const actorName = actorNameMap.get(vote.user_id) ?? "Usuario"
        const notificationId = `${RUNTIME_NOTIFICATION_PREFIX}positive-${vote.positive_id}-${vote.user_id}`
        const createdAt =
          vote.updated_at ??
          vote.created_at ??
          notificationCreatedAtById.current.get(notificationId) ??
          new Date().toISOString()
        items.push({
          id: notificationId,
          label: `${actorName} ${vote.is_confirmed ? "confirmou" : "negou"} seu ponto positivo`,
          preview: vote.is_confirmed ? "Confirmação registrada." : "Negação registrada.",
          href: `/carros/${versionSlug}#positive-point-${vote.positive_id}`,
          createdAt,
          actorName,
          actorAvatarUrl: actorAvatarMap.get(vote.user_id) ?? null,
          actorId: vote.user_id,
          vehicleImageUrl: versionImageMap.get(versionId) ?? null,
          runtimeKind: "vote",
        })
      }
    }

    // Fallback por polling para votos em defeitos reportados pelo próprio usuário.
    const ownedDefectsRes = await supabase
      .from("defects")
      .select("id,vehicle_version_id")
      .eq("created_by", user.id)
      .limit(1500)

    const ownedDefects = (ownedDefectsRes.data as OwnedPointMini[] | null) ?? []
    const ownedDefectMap = new Map(ownedDefects.map((row) => [row.id, row.vehicle_version_id]))
    const ownedDefectIds = ownedDefects.map((row) => row.id)

    if (ownedDefectIds.length > 0) {
      let voteRows: DefectVoteMini[] = []
      const fullVotesRes = await supabase
        .from("defect_votes")
        .select("defect_id,user_id,is_confirmed,created_at,updated_at")
        .in("defect_id", ownedDefectIds)
        .neq("user_id", user.id)

      if (fullVotesRes.error && /column|schema cache/i.test(fullVotesRes.error.message ?? "")) {
        const fallbackVotesRes = await supabase
          .from("defect_votes")
          .select("defect_id,user_id,is_confirmed,created_at")
          .in("defect_id", ownedDefectIds)
          .neq("user_id", user.id)
        voteRows = (fallbackVotesRes.data as DefectVoteMini[] | null) ?? []
      } else if (fullVotesRes.error) {
        const legacyVotesRes = await supabase
          .from("defect_votes")
          .select("defect_id,user_id,is_confirmed")
          .in("defect_id", ownedDefectIds)
          .neq("user_id", user.id)
        voteRows =
          ((legacyVotesRes.data as
            | { defect_id: string; user_id: string; is_confirmed: boolean }[]
            | null) ?? []
          ).map((row) => ({
            ...row,
            created_at: null,
            updated_at: null,
          }))
      } else {
        voteRows = (fullVotesRes.data as DefectVoteMini[] | null) ?? []
      }

      const visibleVotes = voteRows

      const missingActorIds = Array.from(
        new Set(visibleVotes.map((vote) => vote.user_id).filter((id) => !actorNameMap.has(id)))
      )
      if (missingActorIds.length > 0) {
        const extraActorsRes = await supabase
          .from("profiles")
          .select("id,name,avatar_url")
          .in("id", missingActorIds)
        for (const row of
          ((extraActorsRes.data as { id: string; name: string | null; avatar_url?: string | null }[] | null) ?? [])) {
          actorNameMap.set(row.id, row.name ?? "Usuario")
          actorAvatarMap.set(row.id, row.avatar_url ?? null)
        }
      }

      const missingVersionIds = Array.from(
        new Set(
          visibleVotes
            .map((vote) => ownedDefectMap.get(vote.defect_id))
            .filter((id): id is string => Boolean(id && !versionSlugMap.has(id)))
        )
      )
      if (missingVersionIds.length > 0) {
        const extraVersionsRes = await supabase
          .from("vehicle_versions")
          .select("id,slug,image_url")
          .in("id", missingVersionIds)
        for (const row of ((extraVersionsRes.data as VersionMini[] | null) ?? [])) {
          versionSlugMap.set(row.id, row.slug)
          versionImageMap.set(row.id, toVehicleImageSrc(row.image_url ?? null))
        }
      }

      for (const vote of visibleVotes) {
        const versionId = ownedDefectMap.get(vote.defect_id)
        if (!versionId) continue
        const versionSlug = versionSlugMap.get(versionId)
        if (!versionSlug) continue
        const actorName = actorNameMap.get(vote.user_id) ?? "Usuario"
        const notificationId = `${RUNTIME_NOTIFICATION_PREFIX}defect-${vote.defect_id}-${vote.user_id}`
        const createdAt =
          vote.updated_at ??
          vote.created_at ??
          notificationCreatedAtById.current.get(notificationId) ??
          new Date().toISOString()
        items.push({
          id: notificationId,
          label: `${actorName} ${vote.is_confirmed ? "confirmou" : "negou"} seu defeito reportado`,
          preview: vote.is_confirmed ? "Confirmação registrada." : "Negação registrada.",
          href: `/carros/${versionSlug}#defect-point-${vote.defect_id}`,
          createdAt,
          actorName,
          actorAvatarUrl: actorAvatarMap.get(vote.user_id) ?? null,
          actorId: vote.user_id,
          vehicleImageUrl: versionImageMap.get(versionId) ?? null,
          runtimeKind: "vote",
        })
      }
    }

    const uniqueItems = Array.from(
      new Map(
        items
          .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
          .map((item) => [item.id, item])
      ).values()
    ).slice(0, NOTIFICATION_LIMIT)

    let dbItems: NotificationItem[] = []
    const dbRes = await supabase
      .from("user_notifications")
      .select(
        "id,label,preview,href,created_at,updated_at,actor_user_id,actor_name,actor_avatar_url,vehicle_image_url,is_read"
      )
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(NOTIFICATION_LIMIT)

    if (!dbRes.error) {
      const rows = (dbRes.data as DbNotificationRow[] | null) ?? []
      dbItems = rows.map((row) => ({
        id: row.id,
        label: row.label,
        preview: row.preview,
        href: row.href,
        createdAt: row.updated_at ?? row.created_at,
        actorName: row.actor_name ?? "Usuário",
        actorAvatarUrl: row.actor_avatar_url ?? null,
        actorId: row.actor_user_id,
        vehicleImageUrl: toVehicleImageSrc(row.vehicle_image_url ?? null),
      }))

      const readIds = rows.filter((row) => row.is_read).map((row) => row.id)
      if (readIds.length > 0) {
        setReadNotificationIds((prev) => Array.from(new Set([...prev, ...readIds])))
      }
    }

    const sourceItems = Array.from(
      new Map(
        [...dbItems, ...uniqueItems]
          .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
          .map((item) => [item.id, item])
      ).values()
    ).slice(0, NOTIFICATION_LIMIT)

    for (const item of sourceItems) {
      notificationCreatedAtById.current.set(item.id, item.createdAt)
    }

    setNotifications((prev) => {
      const runtimeItems = prev.filter((item) => item.id.startsWith(RUNTIME_NOTIFICATION_PREFIX))
      const merged = [...runtimeItems, ...sourceItems]
      return Array.from(
        new Map(
          merged
            .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
            .map((item) => [item.id, item])
        ).values()
      ).slice(0, NOTIFICATION_LIMIT)
    })

    if (hasFetchedNotifications.current) {
      const incoming = sourceItems.filter((item) => !knownNotificationIds.current.has(item.id))
      if (incoming.length > 0) {
        setLiveToast(incoming[0])
      }
    }
    knownNotificationIds.current = new Set(sourceItems.map((item) => item.id))
    hasFetchedNotifications.current = true
  }, [profileUsername, user])

  const markNotificationsAsRead = useCallback(
    async (ids: string[]) => {
      if (!user?.id || ids.length === 0) return
      await supabase
        .from("user_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_user_id", user.id)
        .in("id", ids)
    },
    [user]
  )

  const applyVoteRuntimeNotification = useCallback(
    (mode: "upsert" | "remove", item: NotificationItem) => {
      setNotifications((prev) => {
        const now = Date.now()
        const existingIndex = prev.findIndex((entry) => entry.id === item.id)
        const existing = existingIndex >= 0 ? prev[existingIndex] : null
        const existingTs = existing ? new Date(existing.createdAt).getTime() : 0
        const withinWindow = existing ? now - existingTs <= VOTE_EDIT_WINDOW_MS : false

        if (mode === "remove") {
          if (!existing || !withinWindow) return prev
          const next = prev.filter((entry) => entry.id !== item.id)
          if (liveToast?.id === item.id) {
            setLiveToast(null)
          }
          return next
        }

        const runtimeItem: NotificationItem = {
          ...item,
          createdAt: new Date().toISOString(),
          runtimeKind: "vote",
        }

        const nextBase =
          existingIndex >= 0
            ? prev.map((entry, index) => (index === existingIndex ? runtimeItem : entry))
            : [runtimeItem, ...prev]

        const next = Array.from(
          new Map(
            nextBase
              .sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt))
              .map((entry) => [entry.id, entry])
          ).values()
        ).slice(0, NOTIFICATION_LIMIT)

        setLiveToast(runtimeItem)
        return next
      })
    },
    [liveToast?.id]
  )

  const queueVoteRuntimeNotification = useCallback(
    (
      mode: "upsert" | "remove",
      item: NotificationItem,
      options?: { delayMs?: number }
    ) => {
      const existingTimer = pendingVoteTimers.current.get(item.id)
      if (existingTimer) {
        clearTimeout(existingTimer)
      }

      const delayMs = Math.max(0, options?.delayMs ?? VOTE_NOTIFICATION_DELAY_MS)
      const timer = setTimeout(() => {
        applyVoteRuntimeNotification(mode, item)
        pendingVoteTimers.current.delete(item.id)
      }, delayMs)

      pendingVoteTimers.current.set(item.id, timer)
    },
    [applyVoteRuntimeNotification]
  )

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void fetchNotifications()
    }, 0)

    const timer = window.setInterval(() => {
      void fetchNotifications()
    }, 20000)

    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(timer)
    }
  }, [fetchNotifications])

  useEffect(() => {
    if (!user?.id) return

    const channel = supabase
      .channel(`notifications-realtime:${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vehicle_comments" },
        () => {
          void fetchNotifications()
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "user_notifications",
          filter: `recipient_user_id=eq.${user.id}`,
        },
        () => {
          void fetchNotifications()
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "positive_votes" },
        async (payload) => {
          const nextRow = payload.new as
            | { positive_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const prevRow = payload.old as
            | { positive_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const positiveId = nextRow?.positive_id ?? prevRow?.positive_id
          const voterId = nextRow?.user_id ?? prevRow?.user_id
          if (!positiveId || !voterId || voterId === user.id) return

          const positiveRes = await supabase
            .from("positives")
            .select("id,vehicle_version_id,created_by")
            .eq("id", positiveId)
            .single()
          const positive = positiveRes.data as { id: string; vehicle_version_id: string; created_by: string | null } | null
          if (!positive || positive.created_by !== user.id) return

          const [profileRes, versionRes] = await Promise.all([
            supabase.from("profiles").select("id,name,avatar_url").eq("id", voterId).single(),
            supabase
              .from("vehicle_versions")
              .select("id,slug,image_url")
              .eq("id", positive.vehicle_version_id)
              .single(),
          ])
          const actor = profileRes.data as ProfileMini | null
          const version = versionRes.data as VersionMini | null
          if (!version?.slug) return

          const runtimeId = `${RUNTIME_NOTIFICATION_PREFIX}positive-${positiveId}-${voterId}`
          if (payload.eventType === "DELETE") {
            queueVoteRuntimeNotification("remove", {
              id: runtimeId,
              label: "",
              preview: "",
              href: "",
              createdAt: new Date().toISOString(),
              actorName: actor?.name ?? "Usuário",
              actorAvatarUrl: actor?.avatar_url ?? null,
              actorId: voterId,
              vehicleImageUrl: null,
            }, { delayMs: COMMENT_VOTE_NOTIFICATION_DELAY_MS })
            return
          }

          const isConfirmed = nextRow?.is_confirmed
          if (typeof isConfirmed !== "boolean") return

          queueVoteRuntimeNotification("upsert", {
            id: runtimeId,
            label: `${actor?.name ?? "Usuário"} ${isConfirmed ? "confirmou" : "negou"} seu ponto positivo`,
            preview: isConfirmed ? "Confirmação registrada." : "Negação registrada.",
            href: `/carros/${version.slug}#positive-point-${positiveId}`,
            createdAt: new Date().toISOString(),
            actorName: actor?.name ?? "Usuário",
            actorAvatarUrl: actor?.avatar_url ?? null,
            actorId: voterId,
            vehicleImageUrl: toVehicleImageSrc(
              version.image_url ?? null
            ),
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "defect_votes" },
        async (payload) => {
          const nextRow = payload.new as
            | { defect_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const prevRow = payload.old as
            | { defect_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const defectId = nextRow?.defect_id ?? prevRow?.defect_id
          const voterId = nextRow?.user_id ?? prevRow?.user_id
          if (!defectId || !voterId || voterId === user.id) return

          const defectRes = await supabase
            .from("defects")
            .select("id,vehicle_version_id,created_by")
            .eq("id", defectId)
            .single()
          const defect = defectRes.data as { id: string; vehicle_version_id: string; created_by: string | null } | null
          if (!defect || defect.created_by !== user.id) return

          const [profileRes, versionRes] = await Promise.all([
            supabase.from("profiles").select("id,name,avatar_url").eq("id", voterId).single(),
            supabase
              .from("vehicle_versions")
              .select("id,slug,image_url")
              .eq("id", defect.vehicle_version_id)
              .single(),
          ])
          const actor = profileRes.data as ProfileMini | null
          const version = versionRes.data as VersionMini | null
          if (!version?.slug) return

          const runtimeId = `${RUNTIME_NOTIFICATION_PREFIX}defect-${defectId}-${voterId}`
          if (payload.eventType === "DELETE") {
            queueVoteRuntimeNotification("remove", {
              id: runtimeId,
              label: "",
              preview: "",
              href: "",
              createdAt: new Date().toISOString(),
              actorName: actor?.name ?? "Usuário",
              actorAvatarUrl: actor?.avatar_url ?? null,
              actorId: voterId,
              vehicleImageUrl: null,
            })
            return
          }

          const isConfirmed = nextRow?.is_confirmed
          if (typeof isConfirmed !== "boolean") return

          queueVoteRuntimeNotification("upsert", {
            id: runtimeId,
            label: `${actor?.name ?? "Usuário"} ${isConfirmed ? "confirmou" : "negou"} seu defeito reportado`,
            preview: isConfirmed ? "Confirmação registrada." : "Negação registrada.",
            href: `/carros/${version.slug}#defect-point-${defectId}`,
            createdAt: new Date().toISOString(),
            actorName: actor?.name ?? "Usuário",
            actorAvatarUrl: actor?.avatar_url ?? null,
            actorId: voterId,
            vehicleImageUrl: toVehicleImageSrc(
              version.image_url ?? null
            ),
          })
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_comment_votes" },
        async (payload) => {
          const nextRow = payload.new as
            | { comment_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const prevRow = payload.old as
            | { comment_id?: string; user_id?: string; is_confirmed?: boolean }
            | null
          const commentId = nextRow?.comment_id ?? prevRow?.comment_id
          const voterId = nextRow?.user_id ?? prevRow?.user_id
          if (!commentId || !voterId || voterId === user.id) return

          const commentRes = await supabase
            .from("vehicle_comments")
            .select("id,vehicle_version_id,created_by")
            .eq("id", commentId)
            .single()
          const comment = commentRes.data as { id: string; vehicle_version_id: string; created_by: string | null } | null
          if (!comment || comment.created_by !== user.id) return

          const [profileRes, versionRes] = await Promise.all([
            supabase.from("profiles").select("id,name,avatar_url").eq("id", voterId).single(),
            supabase
              .from("vehicle_versions")
              .select("id,slug,image_url")
              .eq("id", comment.vehicle_version_id)
              .single(),
          ])
          const actor = profileRes.data as ProfileMini | null
          const version = versionRes.data as VersionMini | null
          if (!version?.slug) return

          const runtimeId = `${RUNTIME_NOTIFICATION_PREFIX}comment-vote-${commentId}-${voterId}`
          if (payload.eventType === "DELETE") {
            queueVoteRuntimeNotification("remove", {
              id: runtimeId,
              label: "",
              preview: "",
              href: "",
              createdAt: new Date().toISOString(),
              actorName: actor?.name ?? "Usuário",
              actorAvatarUrl: actor?.avatar_url ?? null,
              actorId: voterId,
              vehicleImageUrl: null,
            })
            return
          }

          const isConfirmed = nextRow?.is_confirmed
          if (typeof isConfirmed !== "boolean") return

          queueVoteRuntimeNotification("upsert", {
            id: runtimeId,
            label: `${actor?.name ?? "Usuário"} ${isConfirmed ? "confirmou" : "negou"} seu comentário`,
            preview: isConfirmed ? "Confirmação registrada." : "Negação registrada.",
            href: `/carros/${version.slug}#comment-${commentId}`,
            createdAt: new Date().toISOString(),
            actorName: actor?.name ?? "Usuário",
            actorAvatarUrl: actor?.avatar_url ?? null,
            actorId: voterId,
            vehicleImageUrl: toVehicleImageSrc(
              version.image_url ?? null
            ),
          }, { delayMs: COMMENT_VOTE_NOTIFICATION_DELAY_MS })
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [fetchNotifications, queueVoteRuntimeNotification, user?.id])

  useEffect(() => {
    const timersRef = pendingVoteTimers
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer)
      }
      timersRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!liveToast) return
    const timer = window.setTimeout(() => {
      setLiveToast(null)
    }, TOAST_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [liveToast])

  const toggleNotifications = () => {
    if (!user?.id) return
    const next = !notificationsOpen
    setNotificationsOpen(next)
    if (next) setLiveToast(null)
    if (next) {
      const unreadIds = notifications
        .map((item) => item.id)
        .filter((id) => !readNotificationSet.has(id))
      setRecentlyReadOnOpen(unreadIds)
      if (unreadIds.length > 0) {
        setReadNotificationIds((prev) => {
          const merged = new Set([...prev, ...unreadIds])
          return Array.from(merged)
        })
        void markNotificationsAsRead(unreadIds)
      }
    } else {
      setRecentlyReadOnOpen([])
    }
  }

  const scrollToShortcut = (id: string) => {
    if (typeof window === "undefined") return
    const target = document.getElementById(id)
    if (!target) return

    const headerHeight = headerRef.current?.offsetHeight ?? 96
    const targetTop = target.getBoundingClientRect().top + window.scrollY - headerHeight
    window.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" })
    setActiveSection(id)
  }

  return (
    <header
      ref={headerRef}
      data-site-header="true"
      className={`fixed top-0 left-0 w-full z-50 backdrop-blur-md shadow-sm transition-all duration-300 ease-out ${
        scrolled
          ? "bg-gradient-to-b from-gray-300/96 via-gray-100/94 to-white/92 shadow-md"
          : "bg-gradient-to-b from-gray-300/94 via-gray-100/92 to-white/90"
      }`}
    >
      <div
        className={`max-w-7xl mx-auto px-8 flex items-center justify-between transition-all duration-300 ease-out ${
          scrolled ? "py-1.5" : "py-2"
        }`}
      >
        <Link href="/" className="flex items-center shrink-0 pr-3">
          <Image
            src="/logo.png"
            alt="Base Automotiva"
            width={300}
            height={88}
            className={`w-auto shrink-0 transition-all duration-300 ease-out ${
              scrolled ? "h-9" : "h-12"
            }`}
            priority
          />
        </Link>

        <nav
          className={`min-w-0 flex items-center justify-end gap-4 lg:gap-6 text-sm font-medium tracking-wide transition-all duration-300 ${
            scrolled ? "opacity-90" : "opacity-100"
          }`}
        >
          {shortcuts.length > 0 ? (
            <div className="hidden lg:flex items-center gap-4 text-xs font-semibold uppercase tracking-[0.08em]">
              {shortcuts.map((shortcut) =>
                pathname === "/" || isCarSlugPage ? (
                  <button
                    key={shortcut.id}
                    type="button"
                    onClick={() => scrollToShortcut(shortcut.id)}
                    className={`uppercase transition-colors ${
                      activeSection === shortcut.id
                        ? "text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {shortcut.label}
                  </button>
                ) : (
                  <Link
                    key={shortcut.id}
                    href={`/#${shortcut.id}`}
                    className={`uppercase transition-colors ${
                      activeSection === shortcut.id
                        ? "text-black"
                        : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {shortcut.label}
                  </Link>
                )
              )}
            </div>
          ) : null}

          <div className="hidden lg:flex items-center gap-2">
            <div className="relative group">
              <Link
                href="/feed"
                aria-label="Abrir feed"
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-2.5 py-2 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
              >
                <Newspaper size={14} />
              </Link>
              <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-md bg-black px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1 whitespace-nowrap">
                Feed
              </span>
            </div>
            {user ? (
              <div className="relative group">
                <Link
                  href="/postagens/nova"
                  aria-label="Criar nova postagem"
                  className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-2.5 py-2 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
                >
                  <SquarePen size={14} />
                </Link>
                <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-1 -translate-x-1/2 rounded-md bg-black px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-all duration-150 group-hover:opacity-100 group-hover:translate-y-0 translate-y-1 whitespace-nowrap">
                  Nova postagem
                </span>
              </div>
            ) : null}
          </div>

          {user ? (
            <div ref={notificationsRef} className="relative">
              <button
                type="button"
                onClick={toggleNotifications}
                className={`relative inline-flex items-center justify-center rounded-lg border px-2.5 py-2 transition-all duration-200 cursor-pointer ${
                  notificationsOpen
                    ? "border-gray-500 bg-gray-100 text-black"
                    : "border-gray-300 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50"
                }`}
                aria-label="Abrir notificacoes"
              >
                <Bell size={16} />
                {unreadCount > 0 ? (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center px-1">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>

              <div
                className={`absolute right-0 mt-2 w-80 max-w-[86vw] rounded-xl border border-gray-200 backdrop-blur-sm shadow-lg p-2 origin-top-right transition-all duration-200 ${
                  scrolled
                    ? "bg-gradient-to-b from-gray-300/96 via-gray-100/94 to-white/92"
                    : "bg-gradient-to-b from-gray-300/94 via-gray-100/92 to-white/90"
                } ${
                  notificationsOpen
                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                    : "opacity-0 -translate-y-1 scale-95 pointer-events-none"
                }`}
              >
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">
                  Notificacoes
                </p>

                {!notifications.length ? (
                  <p className="px-2 py-4 text-sm text-gray-600">Sem novidades por enquanto.</p>
                ) : (
                  <div className="max-h-96 overflow-auto space-y-1 pr-1">
                    {notifications.map((item) => {
                      const isUnread = !readNotificationSet.has(item.id)
                      const shouldShowUnreadMarker = isUnread || recentlyReadSet.has(item.id)

                      return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => {
                          setNotificationsOpen(false)
                          setRecentlyReadOnOpen([])
                          if (!readNotificationSet.has(item.id)) {
                            setReadNotificationIds((prev) =>
                              prev.includes(item.id) ? prev : [...prev, item.id]
                            )
                            void markNotificationsAsRead([item.id])
                          }
                        }}
                        className={`relative block rounded-lg px-3 py-2 transition-colors ${
                          recentlyReadSet.has(item.id)
                            ? "bg-gray-200/60"
                            : "hover:bg-gray-100"
                        }`}
                      >
                        {shouldShowUnreadMarker ? (
                          <span
                            className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500"
                            aria-label="Notificação não lida"
                          />
                        ) : null}
                        <div className="flex items-start gap-2">
                          {item.vehicleImageUrl ? (
                            <div className="relative h-11 w-16 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                              <Image
                                src={item.vehicleImageUrl}
                                alt="Miniatura do veículo"
                                fill
                                sizes="64px"
                                className="object-cover"
                              />
                            </div>
                          ) : null}

                          <div className="min-w-0 flex-1">
                            <div className="mb-1">
                              <UserIdentityBadge
                                name={item.actorName}
                                profileId={item.actorId}
                                avatarUrl={item.actorAvatarUrl}
                                size="xs"
                                disableProfileLink
                              />
                            </div>
                            <p className="text-sm font-medium text-gray-800">{item.label}</p>
                            <p className="mt-1 text-xs text-gray-600 line-clamp-2">{item.preview}</p>
                            <p className="mt-1 text-[11px] text-gray-500">
                              {new Date(item.createdAt).toLocaleString("pt-BR")}
                            </p>
                          </div>
                        </div>
                      </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 transition-all duration-200 cursor-pointer ${
                menuOpen
                  ? "border-gray-500 bg-gray-100 text-black"
                  : "border-gray-300 text-gray-700 hover:text-black hover:border-gray-400 hover:bg-gray-50"
              }`}
              aria-label="Abrir menu de navegação"
            >
              <Menu
                size={16}
                className={`transition-transform duration-200 ${menuOpen ? "rotate-90" : "rotate-0"}`}
              />
              <span className="text-xs uppercase tracking-[0.08em]">Menu</span>
            </button>

            <div
              className={`absolute right-0 mt-2 w-52 rounded-xl border border-gray-200 backdrop-blur-sm shadow-lg p-2 origin-top-right transition-all duration-200 ${
                scrolled
                  ? "bg-gradient-to-b from-gray-300/96 via-gray-100/94 to-white/92"
                  : "bg-gradient-to-b from-gray-300/94 via-gray-100/92 to-white/90"
              } ${
                menuOpen
                  ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                  : "opacity-0 -translate-y-1 scale-95 pointer-events-none"
              }`}
            >
              {user ? (
                <Link
                  href="/perfil"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <span className="h-8 w-8 rounded-full border border-gray-300 bg-gray-100 overflow-hidden flex items-center justify-center">
                    {profileAvatar ? (
                      <Image
                        src={profileAvatar}
                        alt="Foto de perfil"
                        width={32}
                        height={32}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-semibold text-gray-500">
                        {(profileName ?? user.email ?? "U").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-gray-600">
                    {greeting}, {profileName ?? user.email}
                  </span>
                </Link>
              ) : null}

              <Link
                href="/carros"
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5 ${
                  user ? "mt-1" : ""
                }`}
              >
                Modelos
              </Link>
              <Link
                href="/assinatura"
                onClick={() => setMenuOpen(false)}
                className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
              >
                Assinatura
              </Link>
              {user && profilePlan === "profissional" ? (
                <Link
                  href="/admin/marcas"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
                >
                  Marcas
                </Link>
              ) : null}
              {user && profilePlan === "profissional" ? (
                <Link
                  href="/admin/moderacao"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
                >
                  Moderação
                </Link>
              ) : null}

              {!user ? (
                <Link
                  href="/login"
                  onClick={() => setMenuOpen(false)}
                  className="mt-1 block rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-black transition-all duration-150 hover:translate-x-0.5"
                >
                  Login
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void signOut()
                  }}
                  className="mt-1 block w-full text-left rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-all duration-150"
                >
                  Logout
                </button>
              )}
            </div>
          </div>

        </nav>
      </div>

      {liveToast ? (
        <div className="fixed right-4 top-[86px] z-[60] w-[360px] max-w-[calc(100vw-2rem)]">
          <div className="rounded-xl border border-gray-200 bg-white/95 backdrop-blur-sm shadow-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                  {liveToast.vehicleImageUrl ? (
                    <div className="relative h-12 w-[72px] shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                      <Image
                        src={liveToast.vehicleImageUrl}
                        alt="Miniatura do veículo"
                        fill
                        sizes="72px"
                        className="object-cover"
                      />
                    </div>
                  ) : null}

                  <div className="min-w-0 flex-1">
                    <div className="mb-1">
                      <UserIdentityBadge
                        name={liveToast.actorName}
                        profileId={liveToast.actorId}
                        avatarUrl={liveToast.actorAvatarUrl}
                        size="xs"
                        disableProfileLink
                      />
                    </div>
                    <p className="text-sm font-medium text-gray-800">{liveToast.label}</p>
                    <p className="mt-1 text-xs text-gray-600 line-clamp-2">{liveToast.preview}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                aria-label="Fechar notificação"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-2">
              <Link
                href={liveToast.href}
                onClick={() => {
                  setLiveToast(null)
                  const unreadIds = notifications
                    .map((item) => item.id)
                    .filter((id) => !readNotificationSet.has(id))
                  if (unreadIds.length > 0) {
                    setReadNotificationIds((prev) => {
                      const merged = new Set([...prev, ...unreadIds])
                      return Array.from(merged)
                    })
                    void markNotificationsAsRead(unreadIds)
                  }
                }}
                className="inline-flex text-xs font-medium text-gray-700 hover:text-black underline-offset-2 hover:underline"
              >
                Abrir interação
              </Link>
            </div>

            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                key={liveToast.id}
                className="toast-timer-bar h-full w-full rounded-full bg-gray-700"
                style={{ animationDuration: `${TOAST_DURATION_MS}ms` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
