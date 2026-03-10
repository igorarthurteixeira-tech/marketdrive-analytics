"use client"

import Link from "next/link"
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabaseClient"
import UserIdentityBadge from "@/components/UserIdentityBadge"
import ConfirmActionModal from "@/components/ConfirmActionModal"

type CommentRow = {
  id: string
  content: string
  created_by: string | null
  created_at: string
  parent_comment_id: string | null
  reply_to_user_id: string | null
  is_pinned?: boolean | null
  pinned_at?: string | null
}

type VoteRow = {
  comment_id: string
  user_id: string
  is_confirmed: boolean
}

type VoteStats = {
  confirmed: number
  denied: number
  userVote: boolean | null
}

type ProfileRow = {
  id: string
  name: string | null
  username?: string | null
  avatar_url?: string | null
}

type QuotedPoint = {
  pointType: "positive" | "defect"
  pointId: string
  text: string
  authorName: string
  authorId?: string | null
}

type CommentCard = {
  comment: CommentRow
  commentStats: VoteStats
  authorName: string
  replyToAuthorName: string | null
  replyToUserId: string | null
}

type CommentSortMode = "visibility" | "recency"
const REPLIES_PAGE_SIZE = 16

type PendingDeleteComment = {
  id: string
  authorId: string | null
  mention: string
} | null

const getInitialSortMode = (vehicleVersionId: string): CommentSortMode => {
  if (typeof window === "undefined") return "visibility"
  const saved = window.localStorage.getItem(`comment-sort:${vehicleVersionId}`)
  return saved === "recency" || saved === "visibility" ? saved : "visibility"
}

const QUOTE_PREFIX = "[[QUOTE|"

const serializeQuote = (quote: QuotedPoint) =>
  `${QUOTE_PREFIX}${quote.pointType}|${quote.pointId}|${encodeURIComponent(quote.text)}|${encodeURIComponent(quote.authorName)}|${encodeURIComponent(quote.authorId ?? "")}]]`

const parseCommentContent = (content: string): { quote: QuotedPoint | null; body: string } => {
  if (!content.startsWith(QUOTE_PREFIX)) {
    return { quote: null, body: content }
  }

  const endIndex = content.indexOf("]]")
  if (endIndex === -1) {
    return { quote: null, body: content }
  }

  const header = content.slice(QUOTE_PREFIX.length, endIndex)
  const parts = header.split("|")
  let pointType: "positive" | "defect" = "positive"
  let pointId = ""
  let rawText = ""
  let rawAuthor = ""
  let rawAuthorId = ""

  if (parts.length >= 5) {
    pointType = parts[0] === "defect" ? "defect" : "positive"
    pointId = parts[1]
    rawText = parts[2]
    rawAuthor = parts[3]
    rawAuthorId = parts[4] ?? ""
  } else {
    pointId = parts[0] ?? ""
    rawText = parts[1] ?? ""
    rawAuthor = parts[2] ?? ""
    rawAuthorId = parts[3] ?? ""
  }

  if (!pointId || !rawText || !rawAuthor) {
    return { quote: null, body: content }
  }

  const body = content.slice(endIndex + 2).trimStart()
  return {
    quote: {
      pointType,
      pointId,
      text: decodeURIComponent(rawText),
      authorName: decodeURIComponent(rawAuthor),
      authorId: rawAuthorId ? decodeURIComponent(rawAuthorId) : null,
    },
    body,
  }
}

const toMentionLabel = (value: string) => {
  const clean = value.trim().replace(/^@+/, "")
  if (!clean) return "@autor"
  return `@${clean}`
}

export default function CommentDiscussionSection({
  vehicleVersionId,
  vehicleOwnerId,
}: {
  vehicleVersionId: string
  vehicleOwnerId?: string | null
}) {
  const { session } = useAuth()

  const [comments, setComments] = useState<CommentRow[]>([])
  const [authorNames, setAuthorNames] = useState<Record<string, string>>({})
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string | null>>({})
  const [authorMentions, setAuthorMentions] = useState<Record<string, string>>({})
  const [stats, setStats] = useState<Record<string, VoteStats>>({})
  const [newComment, setNewComment] = useState("")
  const [quotedPoint, setQuotedPoint] = useState<QuotedPoint | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [savingComment, setSavingComment] = useState(false)
  const [savingReply, setSavingReply] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null)
  const [pendingDeleteComment, setPendingDeleteComment] = useState<PendingDeleteComment>(null)
  const [submittingVoteId, setSubmittingVoteId] = useState<string | null>(null)
  const [threadEnabled, setThreadEnabled] = useState(true)
  const [pinEnabled, setPinEnabled] = useState(true)
  const [expandedThreads, setExpandedThreads] = useState<Record<string, boolean>>({})
  const [visibleRepliesByThread, setVisibleRepliesByThread] = useState<Record<string, number>>({})
  const [sortMode, setSortMode] = useState<CommentSortMode>(() =>
    getInitialSortMode(vehicleVersionId)
  )
  const [errorMessage, setErrorMessage] = useState("")
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null)

  const canInteract = Boolean(session?.user?.id)
  const canPinComments = Boolean(session?.user?.id && vehicleOwnerId && session.user.id === vehicleOwnerId)
  const canModerateComments = canPinComments

  const fetchData = useCallback(async () => {
    setLoading(true)
    setErrorMessage("")

    const fullSelect =
      "id,content,created_by,created_at,parent_comment_id,reply_to_user_id,is_pinned,pinned_at"
    const legacySelect = "id,content,created_by,created_at,parent_comment_id,reply_to_user_id"
    const minimalSelect = "id,content,created_by,created_at"

    const fullRes = await supabase
      .from("vehicle_comments")
      .select(fullSelect)
      .eq("vehicle_version_id", vehicleVersionId)
      .order("created_at", { ascending: false })

    let mappedComments: CommentRow[] = []

    if (fullRes.error) {
      if (/column|schema cache/i.test(fullRes.error.message ?? "")) {
        setPinEnabled(false)
        const legacyRes = await supabase
          .from("vehicle_comments")
          .select(legacySelect)
          .eq("vehicle_version_id", vehicleVersionId)
          .order("created_at", { ascending: false })

        if (legacyRes.error) {
          setThreadEnabled(false)
          const minimalRes = await supabase
            .from("vehicle_comments")
            .select(minimalSelect)
            .eq("vehicle_version_id", vehicleVersionId)
            .order("created_at", { ascending: false })

          if (minimalRes.error) {
            setErrorMessage("Falha ao carregar comentários.")
            setLoading(false)
            return
          }

          mappedComments = (
            (minimalRes.data as Omit<
              CommentRow,
              "parent_comment_id" | "reply_to_user_id" | "is_pinned" | "pinned_at"
            >[]) ?? []
          ).map((item) => ({
            ...item,
            parent_comment_id: null,
            reply_to_user_id: null,
            is_pinned: false,
            pinned_at: null,
          }))
        } else {
          setThreadEnabled(true)
          mappedComments = ((legacyRes.data as Omit<CommentRow, "is_pinned" | "pinned_at">[]) ?? []).map(
            (item) => ({
              ...item,
              is_pinned: false,
              pinned_at: null,
            })
          )
        }
      } else {
        setErrorMessage("Falha ao carregar comentários.")
        setLoading(false)
        return
      }
    } else {
      setThreadEnabled(true)
      setPinEnabled(true)
      mappedComments = (fullRes.data as CommentRow[]) ?? []
    }

    setComments(mappedComments)

    const authorIds = Array.from(
      new Set(
        mappedComments
          .flatMap((item) => [item.created_by, item.reply_to_user_id])
          .filter(Boolean)
      )
    ) as string[]

    if (authorIds.length) {
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id,name,username,avatar_url")
        .in("id", authorIds)

      const mappedNames: Record<string, string> = {}
      const mappedAvatars: Record<string, string | null> = {}
      const mappedMentions: Record<string, string> = {}
      for (const row of (profilesData as ProfileRow[] | null) ?? []) {
        mappedNames[row.id] = row.name ?? "Autor"
        mappedAvatars[row.id] = row.avatar_url ?? null
        const username = row.username?.trim()
        mappedMentions[row.id] = username ? username : row.name ?? "autor"
      }
      setAuthorNames(mappedNames)
      setAuthorAvatars(mappedAvatars)
      setAuthorMentions(mappedMentions)
    } else {
      setAuthorNames({})
      setAuthorAvatars({})
      setAuthorMentions({})
    }

    const commentIds = mappedComments.map((item) => item.id)
    if (commentIds.length) {
      const { data: votesData, error: votesError } = await supabase
        .from("vehicle_comment_votes")
        .select("comment_id,user_id,is_confirmed")
        .in("comment_id", commentIds)

      if (votesError) {
        setErrorMessage("Falha ao carregar avaliações dos comentários.")
      } else {
        const nextStats: Record<string, VoteStats> = {}
        for (const row of (votesData as VoteRow[]) ?? []) {
          if (!nextStats[row.comment_id]) {
            nextStats[row.comment_id] = { confirmed: 0, denied: 0, userVote: null }
          }

          if (row.is_confirmed) {
            nextStats[row.comment_id].confirmed += 1
          } else {
            nextStats[row.comment_id].denied += 1
          }

          if (session?.user?.id && row.user_id === session.user.id) {
            nextStats[row.comment_id].userVote = row.is_confirmed
          }
        }
        setStats(nextStats)
      }
    } else {
      setStats({})
    }

    setLoading(false)
  }, [vehicleVersionId, session])

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchData])

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        pointType?: "positive" | "defect"
        pointId?: string
        text?: string
        authorName?: string
        authorId?: string
      }>
      const pointType = customEvent.detail?.pointType === "defect" ? "defect" : "positive"
      const pointId = customEvent.detail?.pointId?.trim()
      const quotedText = customEvent.detail?.text?.trim()
      const authorName = customEvent.detail?.authorName?.trim() ?? "Autor"
      const authorId = customEvent.detail?.authorId?.trim() ?? null
      if (!pointId || !quotedText) return

      setQuotedPoint({
        pointType,
        pointId,
        text: quotedText,
        authorName,
        authorId,
      })

      window.setTimeout(() => {
        if (!commentInputRef.current) return
        commentInputRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
        commentInputRef.current.focus()
      }, 0)
    }

    window.addEventListener("quote-point", handler as EventListener)
    window.addEventListener("quote-positive-point", handler as EventListener)
    window.addEventListener("quote-defect-point", handler as EventListener)
    return () => {
      window.removeEventListener("quote-point", handler as EventListener)
      window.removeEventListener("quote-positive-point", handler as EventListener)
      window.removeEventListener("quote-defect-point", handler as EventListener)
    }
  }, [])

  useEffect(() => {
    const storageKey = `comment-sort:${vehicleVersionId}`
    window.localStorage.setItem(storageKey, sortMode)
  }, [sortMode, vehicleVersionId])

  const handleCommentSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canInteract) {
      setErrorMessage("Faça login para comentar.")
      return
    }

    const body = newComment.trim()
    if (!body && !quotedPoint) return

    setSavingComment(true)
    setErrorMessage("")

    const content = quotedPoint ? `${serializeQuote(quotedPoint)}\n${body}` : body

    const { data, error } = await supabase
      .from("vehicle_comments")
      .insert({
        vehicle_version_id: vehicleVersionId,
        content,
        created_by: session?.user?.id,
      })
      .select("id,content,created_by,created_at,parent_comment_id,reply_to_user_id,is_pinned,pinned_at")
      .single()

    if (error) {
      setErrorMessage(`Falha ao publicar comentário: ${error.message}`)
      setSavingComment(false)
      return
    }

    setNewComment("")
    setQuotedPoint(null)
    if (data) {
      const inserted = data as CommentRow
      setComments((prev) => [inserted, ...prev])
      setStats((prev) => ({
        ...prev,
        [inserted.id]: { confirmed: 0, denied: 0, userVote: null },
      }))
    }
    setSavingComment(false)
  }

  const vote = async (commentId: string, isConfirmed: boolean) => {
    if (!canInteract || !session?.user?.id) {
      setErrorMessage("Faça login para avaliar comentários.")
      return
    }

    setSubmittingVoteId(commentId)
    setErrorMessage("")

    const currentVote = stats[commentId]?.userVote

    const { error } =
      currentVote === isConfirmed
        ? await supabase
            .from("vehicle_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("user_id", session.user.id)
        : await supabase
            .from("vehicle_comment_votes")
            .upsert(
              {
                comment_id: commentId,
                user_id: session.user.id,
                is_confirmed: isConfirmed,
              },
              { onConflict: "comment_id,user_id" }
            )

    if (error) {
      setErrorMessage(`Falha ao registrar avaliação: ${error.message}`)
      setSubmittingVoteId(null)
      return
    }

    setStats((prev) => {
      const current = prev[commentId] ?? { confirmed: 0, denied: 0, userVote: null }
      let confirmed = current.confirmed
      let denied = current.denied
      let userVote: boolean | null = current.userVote

      if (current.userVote === isConfirmed) {
        if (isConfirmed) confirmed = Math.max(0, confirmed - 1)
        else denied = Math.max(0, denied - 1)
        userVote = null
      } else if (current.userVote === null) {
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

      return {
        ...prev,
        [commentId]: { confirmed, denied, userVote },
      }
    })
    setSubmittingVoteId(null)
  }

  const deleteComment = async (commentId: string) => {
    if (!session?.user?.id) {
      setErrorMessage("Faça login para apagar seu comentário.")
      return
    }

    setDeletingCommentId(commentId)
    setErrorMessage("")

    const childIds = comments
      .filter((item) => item.parent_comment_id === commentId)
      .map((item) => item.id)
    const idsToDelete = [commentId, ...childIds]

    const request = canModerateComments
      ? await supabase.from("vehicle_comments").delete().in("id", idsToDelete)
      : await supabase
          .from("vehicle_comments")
          .delete()
          .eq("id", commentId)
          .eq("created_by", session.user.id)

    if (request.error) {
      setErrorMessage(`Falha ao apagar comentário: ${request.error.message}`)
      setDeletingCommentId(null)
      return
    }

    setComments((prev) => prev.filter((item) => !idsToDelete.includes(item.id)))
    setStats((prev) => {
      const next = { ...prev }
      for (const id of idsToDelete) {
        delete next[id]
      }
      return next
    })
    setDeletingCommentId(null)
    setPendingDeleteComment(null)
  }

  const requestDeleteComment = (
    commentId: string,
    authorId: string | null,
    mention: string
  ) => {
    if (!session?.user?.id) return
    if (authorId && authorId !== session.user.id && canModerateComments) {
      setPendingDeleteComment({ id: commentId, authorId, mention })
      return
    }
    void deleteComment(commentId)
  }

  const togglePin = async (rootComment: CommentRow) => {
    if (!canPinComments || !session?.user?.id) {
      setErrorMessage("Somente o autor do veículo pode fixar comentários.")
      return
    }
    if (!pinEnabled) {
      setErrorMessage("Fixação de comentários será liberada após a migração do banco.")
      return
    }

    const targetValue = !rootComment.is_pinned

    if (targetValue) {
      const pinnedCount = comments.filter(
        (item) => item.parent_comment_id === null && item.is_pinned
      ).length
      if (pinnedCount >= 3) {
        setErrorMessage("Você pode fixar no máximo 3 comentários.")
        return
      }
    }

    const { error } = await supabase
      .from("vehicle_comments")
      .update({
        is_pinned: targetValue,
        pinned_at: targetValue ? new Date().toISOString() : null,
      })
      .eq("id", rootComment.id)

    if (error) {
      setErrorMessage(`Falha ao atualizar fixacao: ${error.message}`)
      return
    }

    setErrorMessage("")
    setComments((prev) =>
      prev.map((item) =>
        item.id === rootComment.id
          ? {
              ...item,
              is_pinned: targetValue,
              pinned_at: targetValue ? new Date().toISOString() : null,
            }
          : item
      )
    )
  }

  const submitReply = async (e: FormEvent, rootComment: CommentRow) => {
    e.preventDefault()
    if (!canInteract) {
      setErrorMessage("Faça login para responder comentários.")
      return
    }
    if (!threadEnabled) {
      setErrorMessage("Respostas em discussão serão liberadas após a migração do banco.")
      return
    }
    const rootId = rootComment.id
    const body = (replyDrafts[rootId] ?? "").trim()
    if (!body) return

    setSavingReply(true)
    setErrorMessage("")

    const { data, error } = await supabase
      .from("vehicle_comments")
      .insert({
        vehicle_version_id: vehicleVersionId,
        content: body,
        created_by: session?.user?.id,
        parent_comment_id: rootId,
        reply_to_user_id: rootComment.created_by,
      })
      .select("id,content,created_by,created_at,parent_comment_id,reply_to_user_id,is_pinned,pinned_at")
      .single()

    if (error) {
      setErrorMessage(`Falha ao publicar resposta: ${error.message}`)
      setSavingReply(false)
      return
    }

    if (data) {
      const inserted = data as CommentRow
      setComments((prev) => [inserted, ...prev])
      setStats((prev) => ({
        ...prev,
        [inserted.id]: { confirmed: 0, denied: 0, userVote: null },
      }))
      setExpandedThreads((prev) => ({ ...prev, [rootId]: true }))
    }
    setReplyDrafts((prev) => ({ ...prev, [rootId]: "" }))
    setSavingReply(false)
  }

  const handleRepliesToggle = (threadId: string, totalReplies: number) => {
    const isExpanded = Boolean(expandedThreads[threadId])
    const currentVisible = visibleRepliesByThread[threadId] ?? REPLIES_PAGE_SIZE

    if (!isExpanded) {
      setExpandedThreads((prev) => ({ ...prev, [threadId]: true }))
      setVisibleRepliesByThread((prev) => ({
        ...prev,
        [threadId]: Math.min(REPLIES_PAGE_SIZE, totalReplies),
      }))
      return
    }

    if (currentVisible < totalReplies) {
      setVisibleRepliesByThread((prev) => ({
        ...prev,
        [threadId]: Math.min(currentVisible + REPLIES_PAGE_SIZE, totalReplies),
      }))
      return
    }

    setExpandedThreads((prev) => ({ ...prev, [threadId]: false }))
    setVisibleRepliesByThread((prev) => ({ ...prev, [threadId]: REPLIES_PAGE_SIZE }))
  }

  const cards = useMemo(() => {
    return comments.map((comment) => {
      const commentStats = stats[comment.id] ?? { confirmed: 0, denied: 0, userVote: null }
      return {
        comment,
        commentStats,
        authorName: comment.created_by ? authorNames[comment.created_by] ?? "Autor" : "Autor",
        replyToAuthorName: comment.reply_to_user_id
          ? authorMentions[comment.reply_to_user_id] ?? "autor"
          : null,
        replyToUserId: comment.reply_to_user_id ?? null,
      } satisfies CommentCard
    })
  }, [comments, stats, authorNames, authorMentions])

  const getQuoteMention = useCallback(
    (quote: QuotedPoint) => {
      if (quote.authorId) {
        const mapped = authorMentions[quote.authorId]
        if (mapped) return toMentionLabel(mapped)
      }
      return toMentionLabel(quote.authorName)
    },
    [authorMentions]
  )

  const { rootCards, repliesByRootId } = useMemo(() => {
    const cardById = new Map(cards.map((card) => [card.comment.id, card]))
    const roots: CommentCard[] = []
    const repliesByRoot: Record<string, CommentCard[]> = {}

    for (const card of cards) {
      const parentId = card.comment.parent_comment_id
      const parentExists = parentId ? cardById.has(parentId) : false
      if (!parentId || !parentExists) roots.push(card)
    }

    const rootIds = new Set(roots.map((card) => card.comment.id))
    for (const card of cards) {
      const parentId = card.comment.parent_comment_id
      if (!parentId || !rootIds.has(parentId)) continue
      if (!repliesByRoot[parentId]) repliesByRoot[parentId] = []
      repliesByRoot[parentId].push(card)
    }

    for (const key of Object.keys(repliesByRoot)) {
      repliesByRoot[key].sort(
        (a, b) => new Date(b.comment.created_at).getTime() - new Date(a.comment.created_at).getTime()
      )
    }

    return { rootCards: roots, repliesByRootId: repliesByRoot }
  }, [cards])

  const sortedRootCards = useMemo(() => {
    const getTime = (value: string) => new Date(value).getTime()
    const getVotes = (card: CommentCard) => card.commentStats.confirmed + card.commentStats.denied
    const pinnedPriority = (card: CommentCard) => (card.comment.is_pinned ? 1 : 0)
    const pinTime = (card: CommentCard) =>
      card.comment.pinned_at ? new Date(card.comment.pinned_at).getTime() : 0

    const list = [...rootCards]
    if (sortMode === "recency") {
      list.sort((a, b) => {
        if (pinnedPriority(b) !== pinnedPriority(a)) return pinnedPriority(b) - pinnedPriority(a)
        if (pinnedPriority(a) === 1) return pinTime(b) - pinTime(a)
        return getTime(b.comment.created_at) - getTime(a.comment.created_at)
      })
      return list
    }

    // Visibilidade: mistura volume de respostas + volume de votos na thread.
    list.sort((a, b) => {
      if (pinnedPriority(b) !== pinnedPriority(a)) return pinnedPriority(b) - pinnedPriority(a)
      if (pinnedPriority(a) === 1) return pinTime(b) - pinTime(a)

      const repliesA = repliesByRootId[a.comment.id] ?? []
      const repliesB = repliesByRootId[b.comment.id] ?? []

      const scoreA =
        repliesA.length * 2 +
        getVotes(a) +
        repliesA.reduce((acc, item) => acc + getVotes(item), 0)
      const scoreB =
        repliesB.length * 2 +
        getVotes(b) +
        repliesB.reduce((acc, item) => acc + getVotes(item), 0)

      if (scoreB !== scoreA) return scoreB - scoreA
      return getTime(b.comment.created_at) - getTime(a.comment.created_at)
    })

    return list
  }, [rootCards, repliesByRootId, sortMode])

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleCommentSubmit}
        className="space-y-3 border border-gray-200 rounded-xl p-4 bg-white"
      >
        <label className="block text-sm font-medium text-gray-700">Deixe um comentário</label>

        {quotedPoint ? (
          <div className="inline-flex items-center gap-2 rounded-full bg-gray-100 border border-gray-300 px-3 py-1.5 text-xs">
            <span className="text-gray-700">Citando:</span>
            <span className="font-medium text-gray-700">{getQuoteMention(quotedPoint)}</span>
            <span className="text-gray-500">&quot;{quotedPoint.text}&quot;</span>
            <button
              type="button"
              onClick={() => setQuotedPoint(null)}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
              aria-label="Remover citacao"
            >
              x
            </button>
          </div>
        ) : null}

        <textarea
          ref={commentInputRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
          placeholder="Escreva sua opinião sobre esta versão..."
          className="w-full border border-gray-300 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
        />
        <button
          type="submit"
          disabled={!canInteract || savingComment}
          className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {savingComment ? "Publicando..." : "Publicar"}
        </button>
      </form>

      {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

      {loading ? <p className="text-gray-500">Carregando comentários...</p> : null}
      {!loading && !rootCards.length ? (
        <p className="text-gray-600">Nenhum comentário ainda. Seja o primeiro a comentar.</p>
      ) : null}

      {!loading && rootCards.length ? (
        <div className="flex items-center justify-end gap-2">
          <label htmlFor="comment-sort" className="text-xs text-gray-500">
            Ordenar por
          </label>
          <select
            id="comment-sort"
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as CommentSortMode)}
            className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="visibility">Mais comentado</option>
            <option value="recency">Mais novo para mais antigo</option>
          </select>
        </div>
      ) : null}

      {sortedRootCards.map((rootCard) => {
        const rootId = rootCard.comment.id
        const replies = repliesByRootId[rootId] ?? []
        const expanded = Boolean(expandedThreads[rootId])
        const visibleCount = visibleRepliesByThread[rootId] ?? REPLIES_PAGE_SIZE
        const visibleReplies = expanded ? replies.slice(0, visibleCount) : []
        const parsedRoot = parseCommentContent(rootCard.comment.content)

        return (
          <section key={rootId}>
            <article
              id={`comment-${rootCard.comment.id}`}
              className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm scroll-mt-24"
            >
              {rootCard.comment.is_pinned ? (
                <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
                  Comentário fixado pelo autor
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <UserIdentityBadge
                    name={rootCard.authorName}
                    profileId={rootCard.comment.created_by}
                    avatarUrl={
                      rootCard.comment.created_by
                        ? (authorAvatars[rootCard.comment.created_by] ?? null)
                        : null
                    }
                    badgeText={rootCard.comment.created_by === vehicleOwnerId ? "Autor do veículo" : null}
                    size="sm"
                  />
                  {rootCard.comment.is_pinned ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700">
                      Fixado
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(rootCard.comment.created_at).toLocaleDateString("pt-BR")}
                </span>
              </div>

              {parsedRoot.quote ? (
                <Link
                  href={`#${
                    parsedRoot.quote.pointType === "defect" ? "defect-point" : "positive-point"
                  }-${parsedRoot.quote.pointId}`}
                  className="inline-flex flex-col items-start gap-1 rounded-lg bg-gray-100 border border-gray-300 px-3 py-2 text-xs text-gray-700 hover:text-black hover:bg-gray-50 mb-2"
                >
                  <div className="inline-flex items-center gap-2">
                    <span>Citou</span>
                    <span className="font-medium">{getQuoteMention(parsedRoot.quote)}</span>
                  </div>
                  <span>&quot;{parsedRoot.quote.text}&quot;</span>
                </Link>
              ) : null}

              {parsedRoot.body ? <p className="text-gray-900">{parsedRoot.body}</p> : null}

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => vote(rootCard.comment.id, true)}
                  disabled={!canInteract || submittingVoteId === rootCard.comment.id}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    rootCard.commentStats.userVote === true
                      ? "bg-green-600 border-green-600 text-white"
                      : "border-green-300 text-green-700 hover:bg-green-50"
                  }`}
                >
                  Confirmar ({rootCard.commentStats.confirmed})
                </button>
                <button
                  type="button"
                  onClick={() => vote(rootCard.comment.id, false)}
                  disabled={!canInteract || submittingVoteId === rootCard.comment.id}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                    rootCard.commentStats.userVote === false
                      ? "bg-red-600 border-red-600 text-white"
                      : "border-red-300 text-red-700 hover:bg-red-50"
                  }`}
                >
                  Negar ({rootCard.commentStats.denied})
                </button>
                {session?.user?.id &&
                (rootCard.comment.created_by === session.user.id || canModerateComments) ? (
                  <button
                    type="button"
                    onClick={() =>
                      requestDeleteComment(
                        rootCard.comment.id,
                        rootCard.comment.created_by,
                        toMentionLabel(authorMentions[rootCard.comment.created_by ?? ""] ?? rootCard.authorName)
                      )
                    }
                    disabled={deletingCommentId === rootCard.comment.id}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {deletingCommentId === rootCard.comment.id ? "Apagando..." : "Apagar"}
                  </button>
                ) : null}
                {canPinComments ? (
                  <button
                    type="button"
                    onClick={() => void togglePin(rootCard.comment)}
                    className={`px-3 py-1.5 text-sm rounded-lg border transition-colors cursor-pointer ${
                      rootCard.comment.is_pinned
                        ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {rootCard.comment.is_pinned ? "Desafixar" : "Fixar"}
                  </button>
                ) : null}
              </div>

              {replies.length ? (
                <div className="mt-3 border-t border-gray-200 pt-3">
                  <button
                    type="button"
                    onClick={() => handleRepliesToggle(rootId, replies.length)}
                    className="text-xs text-gray-600 hover:text-black underline-offset-2 hover:underline cursor-pointer"
                  >
                    {!expanded
                      ? `Exibir respostas (${replies.length})`
                      : visibleCount < replies.length
                        ? "Exibir mais 16 comentários"
                        : "Ocultar respostas"}
                  </button>

                  {expanded ? (
                    <div className="mt-2 space-y-2">
                      {visibleReplies.map((reply) => {
                        const parsedReply = parseCommentContent(reply.comment.content)
                        return (
                          <div
                            id={`comment-${reply.comment.id}`}
                            key={reply.comment.id}
                            className="rounded-md bg-gray-50 px-3 py-2 scroll-mt-24"
                          >
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <UserIdentityBadge
                                name={reply.authorName}
                                profileId={reply.comment.created_by}
                                avatarUrl={
                                  reply.comment.created_by
                                    ? (authorAvatars[reply.comment.created_by] ?? null)
                                    : null
                                }
                                badgeText={reply.comment.created_by === vehicleOwnerId ? "Autor do veículo" : null}
                                size="xs"
                              />
                              <span className="text-[11px] text-gray-500">
                                {new Date(reply.comment.created_at).toLocaleDateString("pt-BR")}
                              </span>
                            </div>

                            {reply.replyToAuthorName ? (
                              <div className="mb-1">
                                <UserIdentityBadge
                                  name={`@${reply.replyToAuthorName}`}
                                  profileId={reply.replyToUserId}
                                  avatarUrl={
                                    reply.replyToUserId
                                      ? (authorAvatars[reply.replyToUserId] ?? null)
                                      : null
                                  }
                                  size="xs"
                                />
                              </div>
                            ) : null}

                            {parsedReply.body ? <p className="text-sm text-gray-900">{parsedReply.body}</p> : null}

                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => vote(reply.comment.id, true)}
                                disabled={!canInteract || submittingVoteId === reply.comment.id}
                                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                  reply.commentStats.userVote === true
                                    ? "bg-green-600 border-green-600 text-white"
                                    : "border-green-300 text-green-700 hover:bg-green-50"
                                }`}
                              >
                                Confirmar ({reply.commentStats.confirmed})
                              </button>
                              <button
                                type="button"
                                onClick={() => vote(reply.comment.id, false)}
                                disabled={!canInteract || submittingVoteId === reply.comment.id}
                                className={`px-2.5 py-1 text-xs rounded-lg border transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                                  reply.commentStats.userVote === false
                                    ? "bg-red-600 border-red-600 text-white"
                                    : "border-red-300 text-red-700 hover:bg-red-50"
                                }`}
                              >
                                Negar ({reply.commentStats.denied})
                              </button>
                              {session?.user?.id &&
                              (reply.comment.created_by === session.user.id ||
                                canModerateComments) ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    requestDeleteComment(
                                      reply.comment.id,
                                      reply.comment.created_by,
                                      toMentionLabel(
                                        authorMentions[reply.comment.created_by ?? ""] ?? reply.authorName
                                      )
                                    )
                                  }
                                  disabled={deletingCommentId === reply.comment.id}
                                  className="px-2.5 py-1 text-xs rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                  {deletingCommentId === reply.comment.id ? "Apagando..." : "Apagar"}
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canInteract && threadEnabled ? (
                <form onSubmit={(e) => void submitReply(e, rootCard.comment)} className="mt-3">
                  <div className="space-y-2 border border-gray-200 rounded-lg p-3 bg-white">
                    <textarea
                      value={replyDrafts[rootId] ?? ""}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [rootId]: e.target.value }))
                      }
                      rows={2}
                      placeholder="Escreva sua resposta..."
                      className="w-full border border-gray-300 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black/20 focus:border-black/50"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={!canInteract || savingReply}
                        className="bg-black text-white px-3 py-1.5 text-sm rounded-lg hover:bg-gray-900 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {savingReply ? "Publicando..." : "Responder"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}
            </article>
          </section>
        )
      })}

      <ConfirmActionModal
        open={Boolean(pendingDeleteComment)}
        message={`Este comentário foi feito por "${pendingDeleteComment?.mention ?? "@user"}" e não pode ser revertido, tem certeza que deseja continuar?`}
        confirmLabel="Excluir comentário"
        loading={Boolean(
          pendingDeleteComment && deletingCommentId === pendingDeleteComment.id
        )}
        onCancel={() => setPendingDeleteComment(null)}
        onConfirm={() => {
          if (!pendingDeleteComment) return
          void deleteComment(pendingDeleteComment.id)
        }}
      />
    </div>
  )
}

